"use client";

import Modal from "@/components/ui/Modal";

interface Props {
  title: string;
  description: string;
  deleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function BulkDeleteModal({
  title, description, deleting, onConfirm, onClose,
}: Props) {
  return (
    <Modal title={title} titleClassName="text-red-600" onClose={onClose}>
      <p className="text-sm text-gray-700">
        <strong>{description}</strong> wirklich löschen?
      </p>
      <p className="text-xs text-red-500">Diese Aktion kann nicht rückgängig gemacht werden.</p>
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={onConfirm}
          disabled={deleting}
          className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50"
        >
          {deleting ? "Löschen..." : title}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 border text-sm rounded-md hover:bg-gray-50"
        >
          Abbrechen
        </button>
      </div>
    </Modal>
  );
}
