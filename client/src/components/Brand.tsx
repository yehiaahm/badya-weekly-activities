import shieldUrl from '../assets/sac-shield.png';

/** The Student Athlete Committee shield. Decorative: the lockup text names the site. */
export function BrandMark({ size = 44 }: { size?: number }) {
  return <img src={shieldUrl} alt="" className="brand-mark" height={size} width={Math.round((size * 181) / 226)} />;
}

export function BrandLockup({ subtitle = 'Powered by SAC Sports Technology' }: { subtitle?: string }) {
  return (
    <>
      <BrandMark />
      <span className="brand-text">
        <strong>SAC Sports Hub</strong>
        <small>{subtitle}</small>
      </span>
    </>
  );
}
