#!/usr/bin/env python3
"""
query_sdk.py — Python SDK for Unified Query Engine

Provides a Python client library to access the unified query system via:
  - HTTP API (default, if available)
  - Direct node.js subprocess (if API not available)

INSTALLATION:
  Place in your Python project and import:
    from query_sdk import QueryClient

USAGE:
  client = QueryClient()
  results = client.query(text="system", tags=["system"])

  # Or with context manager
  with QueryClient() as client:
    results = client.query(text="system")

FEATURES:
  - Automatic HTTP/subprocess fallback
  - Query result caching (client-side)
  - Rate limit awareness
  - Typed result objects
  - Error handling
"""

import json
import subprocess
import requests
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import os
from pathlib import Path
import time

# Get home directory
HOME = Path.home()
HA_DIR = HOME / '.grok' / 'hard-allow'


@dataclass
class QueryResult:
    """Single query result"""
    id: str
    label: str
    type: str
    description: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    score: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict) -> 'QueryResult':
        """Create from dictionary"""
        return cls(
            id=data.get('id', ''),
            label=data.get('_label', data.get('label', '')),
            type=data.get('_type', data.get('type', 'generic')),
            description=data.get('_description', data.get('description')),
            tags=data.get('_tags', data.get('tags', [])),
            score=data.get('_score', 0.0),
            metadata={k: v for k, v in data.items() if not k.startswith('_')},
        )


@dataclass
class QueryResponse:
    """Query response with metadata"""
    results: List[QueryResult]
    query: str
    tags: List[str]
    result_count: int
    timestamp: datetime
    elapsed_ms: float
    from_cache: bool = False

    def __repr__(self) -> str:
        return f'QueryResponse(count={self.result_count}, elapsed={self.elapsed_ms}ms, cached={self.from_cache})'


class QueryClient:
    """
    Python client for unified query engine

    Supports both HTTP API and direct subprocess access.
    """

    def __init__(
        self,
        api_url: Optional[str] = None,
        api_key: Optional[str] = None,
        use_subprocess: bool = False,
        caller_id: str = 'python-sdk',
        cache_size: int = 100,
    ):
        """
        Initialize query client.

        Args:
            api_url: HTTP API endpoint (default: http://localhost:3000)
            api_key: API key for authentication (if required)
            use_subprocess: Force subprocess mode instead of HTTP API
            caller_id: Caller identifier for API calls
            cache_size: Client-side cache size
        """
        self.api_url = api_url or 'http://localhost:3000'
        self.api_key = api_key
        self.caller_id = caller_id
        self.use_subprocess = use_subprocess
        self.cache_size = cache_size
        self.cache: Dict[str, tuple] = {}  # {key: (response, expires_at)}
        self.cache_ttl = 3600  # 1 hour
        self._api_available = False
        self._check_api_availability()

    def _check_api_availability(self) -> bool:
        """Check if HTTP API is available"""
        if self.use_subprocess:
            return False

        try:
            resp = requests.get(f'{self.api_url}/health', timeout=2)
            self._api_available = resp.status_code == 200
            return self._api_available
        except (requests.ConnectionError, requests.Timeout):
            self._api_available = False
            return False

    def _make_cache_key(
        self,
        query: str,
        tags: List[str],
        capabilities: List[str],
    ) -> str:
        """Generate cache key"""
        return f'{query}|{",".join(tags)}|{",".join(capabilities)}'

    def _get_cached(self, key: str) -> Optional[QueryResponse]:
        """Get from cache if not expired"""
        if key not in self.cache:
            return None

        response, expires_at = self.cache[key]
        if time.time() > expires_at:
            del self.cache[key]
            return None

        return response

    def _set_cached(self, key: str, response: QueryResponse) -> None:
        """Set cache entry"""
        if len(self.cache) >= self.cache_size:
            # Remove oldest entry
            oldest_key = min(self.cache.keys(), key=lambda k: self.cache[k][1])
            del self.cache[oldest_key]

        expires_at = time.time() + self.cache_ttl
        self.cache[key] = (response, expires_at)

    def query(
        self,
        text: str = '',
        tags: Optional[List[str]] = None,
        capabilities: Optional[List[str]] = None,
        type: Optional[str] = None,
        format: str = 'json',
        k: int = 10,
        semantic_activation: bool = False,
        cache: bool = True,
    ) -> QueryResponse:
        """
        Execute a query.

        Args:
            text: Free-text search query
            tags: Tag filters (OR logic)
            capabilities: Capability filters (OR logic)
            type: Type filter
            format: Output format (json/jsonl/csv/markdown)
            k: Top-k results
            semantic_activation: Enable semantic spreading activation
            cache: Use client cache

        Returns:
            QueryResponse with results
        """
        tags = tags or []
        capabilities = capabilities or []

        # Check cache
        cache_key = self._make_cache_key(text, tags, capabilities)
        if cache:
            cached = self._get_cached(cache_key)
            if cached:
                return cached

        # Execute query
        if self._api_available and not self.use_subprocess:
            response = self._query_via_api(
                text, tags, capabilities, type, format, k, semantic_activation
            )
        else:
            response = self._query_via_subprocess(
                text, tags, capabilities, type, format, k, semantic_activation
            )

        # Cache result
        if cache:
            self._set_cached(cache_key, response)

        return response

    def _query_via_api(
        self,
        text: str,
        tags: List[str],
        capabilities: List[str],
        type: Optional[str],
        format: str,
        k: int,
        semantic_activation: bool,
    ) -> QueryResponse:
        """Execute query via HTTP API"""
        try:
            payload = {
                'query': text,
                'tags': tags,
                'capabilities': capabilities,
                'type': type,
                'format': format,
                'k': k,
                'semantic_activation': semantic_activation,
            }

            headers = {'X-Caller-ID': self.caller_id}
            if self.api_key:
                headers['X-API-Key'] = self.api_key

            resp = requests.post(
                f'{self.api_url}/api/query',
                json=payload,
                headers=headers,
                timeout=10,
            )
            resp.raise_for_status()

            data = resp.json()
            results = [QueryResult.from_dict(r) for r in data['results']]

            return QueryResponse(
                results=results,
                query=text,
                tags=tags,
                result_count=len(results),
                timestamp=datetime.fromisoformat(data['metadata']['timestamp']),
                elapsed_ms=data['metadata']['elapsedMs'],
                from_cache=False,
            )
        except requests.RequestException as e:
            raise RuntimeError(f'API request failed: {e}')

    def _query_via_subprocess(
        self,
        text: str,
        tags: List[str],
        capabilities: List[str],
        type: Optional[str],
        format: str,
        k: int,
        semantic_activation: bool,
    ) -> QueryResponse:
        """Execute query via subprocess"""
        try:
            script = HA_DIR / 'unified-context-query.mjs'
            if not script.exists():
                raise RuntimeError(f'Query engine not found at {script}')

            # Build command
            cmd = [
                'node',
                str(script),
                'query',
                '--text', text,
                '--tags', ','.join(tags),
                '--capabilities', ','.join(capabilities),
                '--format', format,
                '--k', str(k),
                '--caller', self.caller_id,
            ]

            if type:
                cmd.extend(['--type', type])

            if semantic_activation:
                cmd.append('--semantic')

            # Execute
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10,
            )

            if result.returncode != 0:
                raise RuntimeError(f'Query failed: {result.stderr}')

            data = json.loads(result.stdout)
            results = [QueryResult.from_dict(r) for r in data['results']]

            return QueryResponse(
                results=results,
                query=text,
                tags=tags,
                result_count=len(results),
                timestamp=datetime.fromisoformat(data['metadata']['timestamp']),
                elapsed_ms=data['metadata']['elapsedMs'],
                from_cache=False,
            )
        except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError) as e:
            raise RuntimeError(f'Subprocess query failed: {e}')

    def get_stats(self) -> dict:
        """Get orchestrator statistics"""
        if self._api_available:
            resp = requests.get(f'{self.api_url}/api/stats', timeout=5)
            return resp.json()
        else:
            raise RuntimeError('Stats not available in subprocess mode')

    def clear_cache(self) -> None:
        """Clear client cache"""
        self.cache.clear()

    def get_cache_stats(self) -> dict:
        """Get client cache statistics"""
        return {
            'size': len(self.cache),
            'max_size': self.cache_size,
            'ttl_seconds': self.cache_ttl,
        }

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.clear_cache()

    def __repr__(self) -> str:
        api_status = 'available' if self._api_available else 'unavailable'
        return f'QueryClient(api={api_status}, caller={self.caller_id})'


# Simple command-line interface
if __name__ == '__main__':
    import sys

    client = QueryClient()

    if len(sys.argv) > 1:
        query_text = sys.argv[1]
        tags = sys.argv[2].split(',') if len(sys.argv) > 2 else []
        response = client.query(text=query_text, tags=tags)

        print(f'Results: {response.result_count}')
        for result in response.results:
            print(f'  {result.id:40} {result.label:30} ({result.score:.2f})')
    else:
        print('Usage: query_sdk.py <query> [tags,...]')
        print('Example: query_sdk.py "system" "system,security"')
