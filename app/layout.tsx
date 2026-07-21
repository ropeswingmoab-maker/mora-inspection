import "./styles.css";

export const metadata = {
  title: "MORA Vehicle Inspection",
  description: "Mobile vehicle checkout and return inspections"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
