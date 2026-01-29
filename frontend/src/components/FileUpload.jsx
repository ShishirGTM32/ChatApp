import { useRef } from "react";
import { AiOutlineFileImage } from "react-icons/ai";

export default function FileUpload({ onFileSelect, disabled }) {
  const fileInputRef = useRef(null);

  const handleButtonClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      return alert("Please select an image file");
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return alert("Image size must be less than 5MB");
    }

    if (onFileSelect) onFileSelect(file);
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleButtonClick}
        disabled={disabled}
        className="p-3 rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
      >
        <AiOutlineFileImage className="w-5 h-5" />
      </button>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/png,image/jpeg,image/gif"
        disabled={disabled}
      />
    </div>
  );
}
