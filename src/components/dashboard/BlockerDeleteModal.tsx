"use client";

import Modal from "@/components/ui/Modal";
import type { Blocker } from "@/lib/db/schema";

interface Props {
  blocker: Blocker;
  deleteScope: "single" | "group";
  deleting: boolean;
  onScopeChange: (scope: "single" | "group") => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function BlockerDeleteModal({
  blocker, deleteScope, deleting, onScopeChange, onConfirm, onClose,
}: Props) {
  return (
    <Modal title="Blocker löschen" onClose={onClose}>
      <p className="text-sm text-gray-700">
        Blocker <strong>&quot;{blocker.title}&quot;</strong> wirklich löschen?
      </p>

      {blocker.blockerGroupId && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="blockerDeleteScope"
              checked={deleteScope === "single"}
              onChange={() => onScopeChange("single")}
            />
            <span className="text-gray-700">Nur diesen Blocker</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="blockerDeleteScope"
              checked={deleteScope === "group"}
              onChange={() => onScopeChange("group")}
            />
            <span className="text-gray-700">Alle Blocker dieser Gruppe</span>
          </label>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={onConfirm}
          disabled={deleting}
          className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50"
        >
          {deleting ? "Löschen..." : "Löschen"}
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
