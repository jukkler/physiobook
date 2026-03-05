"use client";

interface ModalProps {
  title: string;
  titleClassName?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: "sm" | "md";
}

export default function Modal({
  title,
  titleClassName = "text-gray-900",
  onClose,
  children,
  maxWidth = "sm",
}: ModalProps) {
  const widthClass = maxWidth === "md" ? "max-w-md" : "max-w-sm";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-lg shadow-xl w-full ${widthClass}`}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className={`text-lg font-semibold ${titleClassName}`}>{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="p-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}
