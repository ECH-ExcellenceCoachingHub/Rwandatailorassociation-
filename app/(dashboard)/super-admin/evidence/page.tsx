import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { getDashboardCopy } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/i18n/dates";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { DocumentUpload } from "@/components/dashboard/DocumentUpload";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText, File, Trash2, Eye, Download } from "lucide-react";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.platform.documents.title} | RTA`,
  };
}

export const dynamic = "force-dynamic";

export default async function EvidencePage() {
  await requireSuperAdmin("/super-admin/evidence");
  const { d, locale } = await getDashboardCopy();
  const copy = d.platform.documents;

  const documents = await prisma.document.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      type: true,
      title: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      memberId: true,
      association: { select: { id: true, code: true, name: true } },
      uploadedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const bankCount = documents.filter((d) => d.type === "BANK_STATEMENT").length;
  const momoCount = documents.filter((d) => d.type === "MOMO_STATEMENT").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <Link href="#" className="text-sm flex items-center gap-2 rounded-lg px-3 py-2 text-primary hover:bg-primary-50 transition-colors">
            <File className="size-4" aria-hidden="true" />
            {copy.uploadButton}
          </Link>
        }
      />

      <DocumentUpload />

      <StatGrid columns={4}>
        <StatCard
          label={String(documents.length)}
          value={copy.title}
          icon={FileText}
          tone="primary"
        />
        <StatCard
          label={copy.bankStatement}
          value={String(bankCount)}
          icon={FileText}
        />
        <StatCard
          label={copy.momoStatement}
          value={String(momoCount)}
          icon={FileText}
        />
      </StatGrid>

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={copy.noneTitle}
          description={copy.noneBody}
        />
      ) : (
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.colAssociation}</TableHead>
                <TableHead>{copy.colType}</TableHead>
                <TableHead>{copy.colTitle}</TableHead>
                <TableHead>{copy.colMember}</TableHead>
                <TableHead>{copy.colUploaded}</TableHead>
                <TableHead align="right">{copy.colSize}</TableHead>
                <TableHead>{copy.colActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((document) => (
                <TableRow key={document.id}>
                  <TableCell className="font-medium text-ink">
                    {document.association.name}
                    <span className="mt-0.5 block text-xs font-mono text-ink-muted">
                      {document.association.code}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={document.type === "BANK_STATEMENT" ? "verified" : "pending"}
                      label={
                        document.type === "BANK_STATEMENT"
                          ? copy.bankStatement
                          : copy.momoStatement
                      }
                      size="sm"
                    />
                  </TableCell>
                  <TableCell className="text-sm text-ink">
                    {document.title}
                  </TableCell>
                  <TableCell className="text-sm text-ink-muted">
                    {document.memberId ? "Member" : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                    {formatDateTime(document.createdAt, locale)}
                  </TableCell>
                  <TableCell align="right" className="text-sm text-ink-muted tabular-nums">
                    {(document.sizeBytes / 1024).toFixed(1)} KB
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <a
                      href={`/api/admin/documents/${document.id}`}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-primary hover:bg-primary-50 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Eye className="size-3.5" aria-hidden="true" />
                      <span className="sr-only">{copy.view}</span>
                    </a>
                    <a
                      href={`/api/admin/documents/${document.id}?download=1`}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-primary hover:bg-primary-50 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Download className="size-3.5" aria-hidden="true" />
                      <span className="sr-only">{copy.download}</span>
                    </a>
                    <button
                      onClick={() =>
                        void fetch(`/api/admin/documents/${document.id}`, {
                          method: "DELETE",
                        })
                      }
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      <span className="sr-only">{copy.delete}</span>
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrapper>
      )}
    </div>
  );
}
