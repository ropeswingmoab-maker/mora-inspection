import InspectionForm from "./inspection-form";

export default async function VehiclePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main className="shell"><InspectionForm token={token} /></main>;
}
