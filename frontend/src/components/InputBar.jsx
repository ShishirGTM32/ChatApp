import React, { useState, useRef } from "react";
import { IoSend, IoClose, IoImage } from "react-icons/io5";
import { toast } from "react-toastify";

const FileUpload = ({ onFileSelect, disabled }) => {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        toast.error('Please select a valid image file (JPEG, PNG, GIF, WebP)');
        return;
      }
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error('Image size must be less than 5MB');
        return;
      }

      onFileSelect(file);
    }
    e.target.value = '';
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Upload image"
      >
        <IoImage size={24} />
      </button>
    </>
  );
};

export default function InputBar({
  user,
  socket,
  conversationId,
  onSendMessage,
  createConversationAndSendImage
}) {
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const textareaRef = useRef(null);

  const uploadImageToServer = async (file) => {
    const formData = new FormData();
    formData.append("image", file);

    try {
      const tokens = JSON.parse(localStorage.getItem("tokens"));
      if (!tokens?.access) {
        throw new Error("No auth token available");
      }

      setUploadProgress(10);

      const response = await fetch("http://localhost:8000/api/chat/upload-image/", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokens.access}`
        },
        body: formData
      });

      setUploadProgress(90);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload failed");
      }

      const data = await response.json();
      setUploadProgress(100);

      return data.public_id;
    } catch (error) {
      console.error("Image upload error:", error);
      setUploadProgress(0);
      throw error;
    }
  };

  const handleSend = async () => {
    if (!message.trim() && !selectedFile) return;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      if (!conversationId && selectedFile) {
        const messageText = message.trim();
        const fileToSend = selectedFile;

        setMessage("");
        setSelectedFile(null);
        setSending(true);
        setUploading(true);

        try {
          const b2FileName = await uploadImageToServer(fileToSend);
          setUploading(false);

          if (createConversationAndSendImage) {
            await createConversationAndSendImage({
              image: b2FileName,
              text: messageText
            });
          }

          toast.success("Image sent!");
        } catch (error) {
          toast.error(error.message || "Failed to send image");
          setMessage(messageText);
          setSelectedFile(fileToSend);
        } finally {
          setSending(false);
          setUploading(false);
          setUploadProgress(0);
        }
        return;
      }

      toast.error("Connection lost. Please refresh the page.");
      return;
    }

    const messageText = message.trim();
    const fileToSend = selectedFile;

    setMessage("");
    setSelectedFile(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    setSending(true);

    try {
      if (fileToSend) {
        setUploading(true);

        // const tempId = `temp-${Date.now()}-${Math.random()}`;
        // const optimisticMessage = {
        //   mid: tempId,
        //   message: messageText,
        //   image: null, 
        //   localFile: fileToSend,
        //   sender: user.id,
        //   sender_name: user.name || `${user.first_name} ${user.last_name}`.trim() || user.email,
        //   sender_email: user.email,
        //   timestamp: new Date().toISOString(),
        //   status: "sending",
        //   isOptimistic: true,
        //   message_type: "IMAGE"
        // };

        // if (onSendMessage) onSendMessage(optimisticMessage);

        // Upload image first
        const publicId = await uploadImageToServer(fileToSend);;

        setUploading(false);

        // Update optimistic message with B2 filename
        // if (onSendMessage) {
        //   onSendMessage({
        //     ...optimisticMessage,
        //     mid: tempId,
        //     image: b2FileName,
        //     isOptimistic: true 
        //   });
        // }

        // Send WebSocket message with B2 file name
        socket.send(JSON.stringify({
          type: "image",
          image: publicId,
          text: messageText
        }));

      } else {
        const tempId = `temp-${Date.now()}-${Math.random()}`;
        const optimisticMessage = {
          mid: tempId,
          message: messageText,
          sender: user.id,
          sender_name: user.name || `${user.first_name} ${user.last_name}`.trim() || user.email,
          sender_email: user.email,
          timestamp: new Date().toISOString(),
          status: "sending",
          isOptimistic: true,
          message_type: "TEXT"
        };

        if (onSendMessage) onSendMessage(optimisticMessage);

        socket.send(JSON.stringify({
          type: "chat_message",
          text: messageText
        }));
      }
    } catch (err) {
      console.error("Send error:", err);
      toast.error(err.message || "Failed to send message");

      setMessage(messageText);
      if (fileToSend) {
        setSelectedFile(fileToSend);
      }
    } finally {
      setSending(false);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e) => {
    setMessage(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
  };

  const removeSelectedFile = () => {
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      URL.revokeObjectURL(url);
    }
    setSelectedFile(null);
  };

  React.useEffect(() => {
    return () => {
      if (selectedFile) {
        const url = URL.createObjectURL(selectedFile);
        URL.revokeObjectURL(url);
      }
    };
  }, [selectedFile]);

  return (
    <div className="border-t bg-white p-3 flex flex-col gap-2">
      {selectedFile && (
        <div className="relative inline-block">
          <div className="relative w-32 h-32 group">
            <img
              src={URL.createObjectURL(selectedFile)}
              alt="Preview"
              className="w-full h-full object-cover rounded-lg shadow-md border border-gray-200"
            />
            <button
              type="button"
              onClick={removeSelectedFile}
              disabled={sending || uploading}
              className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors z-10"
              title="Remove image"
            >
              <IoClose size={16} />
            </button>

            {/* Upload progress overlay */}
            {uploading && uploadProgress > 0 && (
              <div className="absolute inset-0 bg-black bg-opacity-60 rounded-lg flex items-center justify-center">
                <div className="text-white text-xs font-medium">
                  {uploadProgress}%
                </div>
              </div>
            )}
          </div>
          {/* <p className="text-xs text-gray-500 mt-1 truncate max-w-[128px]">
            {selectedFile.name}
          </p>
          <p className="text-xs text-gray-400">
            {(selectedFile.size / 1024).toFixed(1)} KB
          </p> */}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        <FileUpload
          onFileSelect={setSelectedFile}
          disabled={sending || uploading}
        />

        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyPress}
          placeholder={selectedFile ? "Add a caption (optional)..." : "Type a message..."}
          disabled={sending || uploading}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none overflow-hidden disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
          rows={1}
          style={{ minHeight: "40px", maxHeight: "128px" }}
        />

        <button
          onClick={handleSend}
          disabled={sending || uploading || (!message.trim() && !selectedFile)}
          className="p-3 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center min-w-[48px]"
          title={uploading ? "Uploading..." : "Send"}
        >
          {uploading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <IoSend size={20} />
          )}
        </button>
      </div>

      {uploading && (
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-500 h-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 min-w-[45px]">
            {uploadProgress}%
          </span>
        </div>
      )}
    </div>
  );
}