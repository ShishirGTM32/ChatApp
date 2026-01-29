import React, { useState, useEffect } from "react";
import { IoExpand } from "react-icons/io5";

const ImageViewer = ({ imageUrl, onClose, caption }) => {
  useEffect(() => {
    document.body.style.overflow = 'hidden';

    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      <div className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center p-8">
        <img
          src={imageUrl}
          alt={caption || "Full size image"}
          className="max-w-full max-h-full object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
};

const ImageMessage = ({ publicId, message, isLoading, localFile }) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [currentSource, setCurrentSource] = useState(null);

  useEffect(() => {
    let isMounted = true;
    let objectUrl = null;

    const loadImage = async () => {
      try {
        if (localFile) {
          objectUrl = URL.createObjectURL(localFile);
          if (isMounted) {
            setImageUrl(objectUrl);
            setCurrentSource("local");
            setError(false);
            setImgLoaded(false);
          }
          return;
        }
        if (!publicId) {
          if (isMounted) setError(true);
          return;
        }

        if (currentSource === "remote" && imageUrl) return;

        const tokens = JSON.parse(localStorage.getItem("tokens"));
        const res = await fetch("http://localhost:8000/api/chat/signedimage/", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${tokens?.access}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ public_id: publicId }),
        });

        if (!res.ok) throw new Error("Failed to fetch image");

        const data = await res.json();
        if (isMounted) {
          setImageUrl(data.signed_url);
          setCurrentSource("remote");
          setError(false);
          setImgLoaded(false);
        }

      } catch (err) {
        console.error("Image load error:", err);
        if (isMounted) {
          setError(true);
          if (retryCount < 2) {
            setTimeout(() => setRetryCount(prev => prev + 1), 1000 * (retryCount + 1));
          }
        }
      }
    };

    loadImage();

    return () => {
      isMounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [publicId, localFile, retryCount]);

  useEffect(() => {
    return () => {
      if (imageUrl && currentSource === "local") {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl, currentSource]);

  const handleImageClick = () => {
    if (!isLoading && imgLoaded && imageUrl) {
      setViewerOpen(true);
    }
  };

  if (error && !localFile) {
    return (
      <div className="w-full max-w-xs">
        <div className="w-full h-48 bg-gray-100 rounded-lg flex flex-col items-center justify-center border border-gray-300">
          <svg className="w-12 h-12 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-gray-500 text-center px-4">Failed to load image</p>
          {retryCount < 2 && (
            <button
              onClick={() => setRetryCount(prev => prev + 1)}
              className="mt-2 text-xs text-blue-500 hover:text-blue-600"
            >
              Retry
            </button>
          )}
        </div>
        {message && (
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap mt-2">
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="relative w-full max-w-xs">
        {!imgLoaded && !error && (
          <div className="w-full h-48 bg-gray-200 animate-pulse rounded-lg flex items-center justify-center">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2" />
              <span className="text-xs text-gray-500">Loading...</span>
            </div>
          </div>
        )}

        {imageUrl && (
          <div className="relative group">
            <img
              src={imageUrl}
              alt={message || "Uploaded image"}
              className={`w-full rounded-lg shadow-md transition-all duration-200 ${imgLoaded ? 'cursor-pointer hover:opacity-95' : ''}`}
              onLoad={() => setImgLoaded(true)}
              onClick={handleImageClick}
              style={{
                maxHeight: '400px',
                objectFit: 'cover',
                display: imgLoaded ? 'block' : 'none'
              }}
            />

            {message && imgLoaded && (
              <p className="text-sm leading-relaxed break-words whitespace-pre-wrap mt-2">
                {message}
              </p>
            )}

            {!isLoading && imgLoaded && (
              <div className="absolute top-2 right-2 p-2 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <IoExpand className="text-white" size={16} />
              </div>
            )}
          </div>
        )}
      </div>

      {viewerOpen && imageUrl && (
        <ImageViewer
          imageUrl={imageUrl}
          caption={message}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
};

export default ImageMessage;