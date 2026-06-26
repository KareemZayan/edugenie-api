import { UserResponse } from '../../users/interfaces/user-response.interface';

export interface AuthResponse {
  message: string;
  user?: UserResponse;
  exchangeToken?: string;
  token?: string;
}
