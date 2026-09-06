import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { PageBody, PageHeader } from "@/components/workspace/PageHeader";
import { ImportWizard } from "@/components/datasets/ImportWizard";
import { Panel, PanelContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "New dataset",
  robots: { index: false, follow: false },
};

export default async function NewDatasetPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/datasets/new");

  return (
    <PageBody className="max-w-2xl">
      <PageHeader
        eyebrow={<Link href="/datasets" className="hover:text-foreground">Datasets</Link>}
        title="New dataset"
        description="Import a GTFS archive. It is validated in your browser before anything is uploaded, then processed on the server."
      />

      <Panel>
        <PanelContent className="pt-5">
          <ImportWizard />
        </PanelContent>
      </Panel>
    </PageBody>
  );
}
