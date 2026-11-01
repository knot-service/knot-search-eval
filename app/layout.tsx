import "./globals.css";
export const metadata = {
  title: "Knot · 탐색 평가",
  description: "합성 평가셋과 실험 결과를 관리합니다.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
