import "./styles.css";

export const metadata = {
  title: "MORA Vehicle Inspection",
  description: "Mobile vehicle checkout and return inspections",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isTest = process.env.NEXT_PUBLIC_APP_ENV === "test";

  return (
    <html lang="en">
      <body>
        {isTest && (
          <div
            style={{
              background: "#f97316",
              color: "white",
              textAlign: "center",
              padding: "10px",
              fontWeight: 700,
              fontSize: "16px",
              position: "sticky",
              top: 0,
              zIndex: 9999,
            }}
          >
            🧪 TEST ENVIRONMENT — All inspections submitted here are saved to the
            TEST database.
          </div>
        )}

        {children}
      </body>
    </html>
  );
}