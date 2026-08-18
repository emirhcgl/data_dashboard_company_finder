import { redirect } from "next/navigation";
import { getSession } from "@/app/lib/session";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/auth/login");
  }

  return <>{children}</>;
}
