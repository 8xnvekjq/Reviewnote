// 새 Pixel World(베타)는 선생님(관리자)과 테스트 계정만 본다. 학생에게는 아직 진입 버튼 자체가 없다.
// 이 파일은 앱 첫 번들에 들어가므로 Phaser나 게임 코드를 절대 import하지 않는다.
export const PIXEL_WORLD_BETA_TEST_EMAIL = 'test@reviewnote.com';
export function canOpenPixelWorldBeta(isAdmin: boolean, email: string | null | undefined): boolean {
  return isAdmin || (email ?? '').trim().toLowerCase() === PIXEL_WORLD_BETA_TEST_EMAIL;
}
