import { makeApi } from '../../../shared/api'

const BASE = import.meta.env.VITE_API_BASE ?? ''
export const api = makeApi(BASE, true) // cookies for staff

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch('/api/health', {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
      credentials: 'include'
    });
    return response.ok;
  } catch {
    return false;
  }
}
