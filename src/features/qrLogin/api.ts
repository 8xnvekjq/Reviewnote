import { supabase } from '../../services/supabase';
import { normalizeCode } from './helpers';

export const QR_LOGIN_ERROR = 'QR이 만료됐거나 이미 사용됐어요. 휴대폰에서 새로 만들어 주세요.';
export interface QrLoginToken { id: string; token: string; code: string; expires_at: string }
export type QrLoginStatus = 'pending' | 'used' | 'expired';

export async function createQrLoginToken(): Promise<QrLoginToken> {
  const { data, error } = await supabase.rpc('create_qr_login_token');
  if (error) throw new Error('QR을 만들 수 없어요. 잠시 후 다시 시도해 주세요.');
  return data as QrLoginToken;
}

export async function qrLoginTokenStatus(id: string): Promise<QrLoginStatus> {
  const { data, error } = await supabase.rpc('qr_login_token_status', { p_id: id });
  if (error) throw new Error('로그인 상태를 확인할 수 없어요.');
  return data as QrLoginStatus;
}

export async function redeemQrLogin(input: { token: string } | { code: string }): Promise<void> {
  try {
    const body = 'code' in input ? { code: normalizeCode(input.code) } : input;
    const { data, error } = await supabase.functions.invoke('qr-login', { body });
    if (error || !data?.token_hash) throw new Error(QR_LOGIN_ERROR);
    const result = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
    if (result.error || !result.data.session) throw new Error(QR_LOGIN_ERROR);
  } catch { throw new Error(QR_LOGIN_ERROR); }
}
