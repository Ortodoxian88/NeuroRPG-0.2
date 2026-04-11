import { supabase } from '../supabase';

const API_URL = '/api';

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }
  const token = session.access_token;
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

export const api = {
  // Rooms
  async createRoom(scenario: string) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/rooms`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ scenario })
    });
    if (!res.ok) throw new Error('Failed to create room');
    return res.json();
  },

  async getRooms() {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/rooms`, { headers });
    if (!res.ok) throw new Error('Failed to fetch rooms');
    return res.json();
  },

  async getRoom(roomId: string) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/rooms/${roomId}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch room');
    return res.json();
  },

  async joinRoom(joinCode: string, characterData: any) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/rooms/join`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ joinCode, ...characterData })
    });
    if (!res.ok) throw new Error('Failed to join room');
    return res.json();
  },

  // Players
  async getPlayers(roomId: string) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/rooms/${roomId}/players`, { headers });
    if (!res.ok) throw new Error('Failed to fetch players');
    return res.json();
  },

  async submitAction(roomId: string, action: string, isHidden: boolean = false) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/rooms/${roomId}/players/action`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, isHidden })
    });
    if (!res.ok) throw new Error('Failed to submit action');
    return res.json();
  },

  async updatePlayer(roomId: string, updates: any) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/rooms/${roomId}/players/update`, {
      method: 'POST',
      headers,
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('Failed to update player');
    return res.json();
  },

  // Messages
  async getMessages(roomId: string, limit = 50, offset = 0) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/rooms/${roomId}/messages?limit=${limit}&offset=${offset}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch messages');
    return res.json();
  },

  async sendMessage(roomId: string, content: string, type: string = 'player_action', turn_number: number = 0) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/rooms/${roomId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content, type, turn_number })
    });
    if (!res.ok) throw new Error('Failed to send message');
    return res.json();
  },

  // AI
  async generateJoin(characterName: string, characterProfile: string, roomId?: string) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/gemini/join`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ characterName, characterProfile, roomId })
    });
    if (!res.ok) throw new Error('Failed to generate join');
    return res.json();
  },

  async generateTurn(roomId: string, payload: any) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/gemini/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ roomId, ...payload })
    });
    if (!res.ok) throw new Error('Failed to generate turn');
    return res.json();
  },

  async summarize(roomId: string, currentSummary: string, recentMessages: string) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/gemini/summarize`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ roomId, currentSummary, recentMessages })
    });
    if (!res.ok) throw new Error('Failed to summarize');
    return res.json();
  },

  // Bestiary
  async getBestiary(search = '', category = '') {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/bestiary?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch bestiary');
    return res.json();
  },

  async processArchivist(roomId: string, candidates: any[]) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/gemini/archivist`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ roomId, candidates })
    });
    if (!res.ok) throw new Error('Failed to process archivist candidates');
    return res.json();
  }
};
