import type { ReactNode } from "react";

export const metadata = {
  title: "QA Work Allotment",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          margin: 0,
          background: "#f7f7f8",
          color: "#111",
        }}
      >
        {children}
      </body>
    </html>
  );
}
