export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  memberId: string;
  name: string;
  email: string;
  role: string;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    body: JSON.stringify({ email, password }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('이메일 또는 비밀번호를 확인해 주세요.');
  }
  return response.json();
}
