import { ImageResponse } from "next/og";

export const alt = "같이볼래 — 둘이 오늘 보기 좋은 콘텐츠를 함께 고르는 서비스";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 82px",
          color: "#17211f",
          background: "#f4f5f1",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 34, height: 34, display: "flex", borderRadius: 8, background: "#315c54" }} />
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: "-1px" }}>같이볼래</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", color: "#60736d", fontSize: 22, fontWeight: 700 }}>둘이 고르는 오늘의 한 편</div>
          <div style={{ display: "flex", maxWidth: 920, fontSize: 68, fontWeight: 700, lineHeight: 1.18, letterSpacing: "-3px" }}>
            오늘 함께 볼 콘텐츠를<br />3분 안에 골라보세요
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", color: "#67756f", fontSize: 24 }}>상황과 두 사람의 취향을 맞춘 콘텐츠 추천</div>
          <div style={{ display: "flex", padding: "14px 22px", border: "2px solid #cad7d1", borderRadius: 10, color: "#315c54", fontSize: 20, fontWeight: 700 }}>
            추천은 단 3개만
          </div>
        </div>
      </div>
    ),
    size,
  );
}
