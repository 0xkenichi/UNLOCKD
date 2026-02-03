const API_BASE =
  import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

export async function apiPost(path, payload = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

export async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

export async function apiDownload(path, filename) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename || 'download.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function fetchActivity() {
  const data = await apiGet('/api/activity');
  return { items: data.items || [], meta: data.meta || null };
}

export async function fetchRepaySchedule() {
  const data = await apiGet('/api/repay-schedule');
  return data.items || [];
}

export async function fetchVestedContracts() {
  const data = await apiGet('/api/vested-contracts');
  return data.items || [];
}

export async function fetchVestedSnapshots() {
  const data = await apiGet('/api/vested-snapshots');
  return data.snapshots || [];
}

export async function askAgent(message, history = []) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const data = await fetch(`${API_BASE}/api/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
      signal: controller.signal
    }).then((res) => {
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return res.json();
    });
    if (data && data.ok === false) {
      throw new Error(data.error || 'Agent responded with an error');
    }
    return {
      answer: data.answer || '',
      sources: data.sources || [],
      mode: data.mode || 'unknown',
      provider: data.provider || null
    };
  } finally {
    clearTimeout(timeout);
  }
}
