import { q } from '../../lib/server';
import { when } from '../../lib/format';
import { Section, Row, Empty, Meta, TitleLine } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CommandForm } from '../../components/CommandForm';

/** Clinical notes: drafts with template prompts, signing with password re-check, amendments and late entries. */
export async function NotesTab({ id, paths }: { id: string; paths: string[] }) {
  const d = await q<any>(`query Notes($id: ID!) {
    clinicalNotes(where: { patient: { id: { equals: $id } } }, orderBy: { createdAt: desc }, take: 40) { id title body status version isLateEntry signedAt createdAt author { name } amends { id title } errorReason }
    noteTemplateVersions(where: { status: { equals: "published" } }, orderBy: { createdAt: asc }) { id body template { name } }
  }`, { id });
  const notes = d.clinicalNotes as any[];
  const templates = d.noteTemplateVersions as any[];
  return (
    <>
      <Section title="New note">
        <CommandForm op="draftClinicalNote" submitLabel="Save draft" paths={paths} columns={2} fixed={{ patientId: id }}
          fields={[
            { name: 'templateVersionId', label: 'Start from a template', kind: 'select', options: [{ value: '', label: 'Blank note' }, ...templates.map((t) => ({ value: t.id, label: t.template.name }))] },
            { name: 'title', label: 'Title', kind: 'text', required: true, placeholder: 'e.g. Restorative visit' },
            { name: 'body', label: 'Note', kind: 'textarea', hint: 'Leave empty to start from the template’s prompts.' },
          ]} />
      </Section>
      <Section title="Notes">
        {notes.length ? notes.map((n) => (
          <div key={n.id} className="space-y-2 border-b py-3 text-sm last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TitleLine status={n.status}><span className="font-medium">{n.title}</span>{n.isLateEntry ? <Meta>late entry</Meta> : null}{n.amends ? <Meta>amends “{n.amends.title}”</Meta> : null}</TitleLine>
              <Meta>{n.author?.name} · {n.signedAt ? `signed ${when(n.signedAt, undefined, 'dayTime')}` : `started ${when(n.createdAt, undefined, 'dayTime')}`}</Meta>
            </div>
            <p className="whitespace-pre-wrap break-words text-muted-foreground">{n.body}</p>
            {n.errorReason ? <Meta>Entered in error: {n.errorReason}</Meta> : null}
            {n.status === 'draft' ? (
              <details>
                <summary className="cursor-pointer font-medium">Edit and sign</summary>
                <div className="space-y-4 pt-3">
                  <CommandForm op="updateNoteDraft" submitLabel="Save draft" paths={paths} columns={1} fixed={{ noteId: n.id, expectedVersion: n.version }} fields={[{ name: 'body', label: 'Note', kind: 'textarea', defaultValue: n.body, required: true }]} />
                  <CommandForm op="signClinicalNote" submitLabel="Sign note" paths={paths} columns={2} fixed={{ noteId: n.id, expectedVersion: n.version }} fields={[{ name: 'password', label: 'Your password', kind: 'password', required: true, hint: 'A signed note cannot be changed. Corrections are added as an amendment.' }]} />
                </div>
              </details>
            ) : null}
            {n.status === 'signed' ? (
              <div className="flex flex-wrap gap-2">
                <details>
                  <summary className="cursor-pointer font-medium">Add an amendment</summary>
                  <div className="pt-3"><CommandForm op="draftClinicalNote" submitLabel="Start amendment" paths={paths} columns={1} fixed={{ patientId: id, amendsNoteId: n.id }} fields={[{ name: 'title', label: 'Title', kind: 'text', defaultValue: `Amendment: ${n.title}`, required: true }, { name: 'body', label: 'What is being added or corrected', kind: 'textarea', required: true }]} /></div>
                </details>
                <ActionButton op="markNoteEnteredInError" vars={{ noteId: n.id, expectedVersion: n.version }} ask="Why was this note entered in error? The text stays on file." paths={paths}>Entered in error</ActionButton>
              </div>
            ) : null}
          </div>
        )) : <Empty>No notes yet.</Empty>}
      </Section>
    </>
  );
}
