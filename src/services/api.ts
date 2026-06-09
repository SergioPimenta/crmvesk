// Dev: proxy Vite (/api). Produção na Vercel: mesmo domínio (/api). Só use VITE_API_URL se a API for externa.
const envApi = import.meta.env.VITE_API_URL as string | undefined;
const BASE_URL =
  envApi && !envApi.includes('localhost') ? envApi.replace(/\/$/, '') : '/api';

interface FetchOptions extends RequestInit {
  data?: any;
}

class ApiService {
  private async request<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const url = `${BASE_URL}${endpoint}`;
    
    // Config headers
    const headers = new Headers(options.headers || {});
    
    // Auto-attach JSON format if not specified
    if (!headers.has('Content-Type') && !(options.data instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    // Auto-attach auth token
    const token = localStorage.getItem('token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const config: RequestInit = {
      ...options,
      headers,
    };

    if (options.data) {
      config.body = options.data instanceof FormData ? options.data : JSON.stringify(options.data);
    }

    try {
      const response = await fetch(url, config);
      if (!response.ok) {
        const isJson = response.headers.get('content-type')?.includes('application/json');
        const errBody = isJson ? await response.json() : await response.text();
        throw new Error((errBody && errBody.message) || response.statusText);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const raw = await response.text();
      if (!raw) {
        return undefined as T;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return JSON.parse(raw) as T;
      }

      return raw as T;
    } catch (error: any) {
      console.error('API Error:', error);
      throw error;
    }
  }

  get<T>(endpoint: string, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, data?: any, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: 'POST', data });
  }

  put<T>(endpoint: string, data?: any, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: 'PUT', data });
  }

  patch<T>(endpoint: string, data?: any, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', data });
  }

  delete<T>(endpoint: string, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiService();
