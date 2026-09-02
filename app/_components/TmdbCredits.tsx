const TMDB_LOGO_URL = "https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg";

export function TmdbCredits() {
  return (
    <footer className="tmdb-credits" aria-label="데이터 출처 및 크레딧">
      <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
        {/* TMDB가 제공하는 승인된 원본 SVG를 변형 없이 표시한다. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={TMDB_LOGO_URL} alt="The Movie Database (TMDB)" width="88" height="13" />
      </a>
      <p>
        콘텐츠 정보와 이미지는 TMDB를 사용합니다.
        <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
      </p>
    </footer>
  );
}
