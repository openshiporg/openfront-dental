'use client';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

/** An in-page yes/no question, in place of the browser's own confirm pop-up. Open while `question` is set. */
export function ConfirmDialog({ question, detail, yes, onYes, onClose, danger }: { question: string | null; detail?: string; yes: string; onYes: () => void; onClose: () => void; danger?: boolean }) {
  return (
    <AlertDialog open={question !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{question}</AlertDialogTitle>
          {detail ? <AlertDialogDescription>{detail}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11 md:min-h-9">Go back</AlertDialogCancel>
          <AlertDialogAction className={danger ? 'min-h-11 bg-destructive text-white hover:bg-destructive/90 md:min-h-9' : 'min-h-11 md:min-h-9'} onClick={() => { onYes(); onClose(); }}>{yes}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
