const API_BASE = '';

export function getAuthToken(): string | null {
  return localStorage.getItem('virasat_token');
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem('virasat_token', token);
  } else {
    localStorage.removeItem('virasat_token');
  }
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.detail || `Request failed (${response.status})`);
  }
  return data as T;
}

export function getDocumentUrl(docId: string): string {
  const token = getAuthToken();
  return `${API_BASE}/api/documents/${docId}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}
