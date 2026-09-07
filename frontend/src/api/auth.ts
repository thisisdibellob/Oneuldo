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

export type SignUpRequest = {
  loginId: string;
  name: string;
  email: string;
  password: string;
  passwordConfirm: string;
  birthDate: string;
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

export async function signUp(request: SignUpRequest): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/members`, {
    body: JSON.stringify(request),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    if (response.status === 409) throw new Error('이미 사용 중인 아이디 또는 이메일이에요.');
    throw new Error('입력 내용을 확인해 주세요.');
  }
}
