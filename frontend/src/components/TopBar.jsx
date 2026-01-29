import React from 'react';
import { useAuth } from "../context/AuthContext";

const TopBar = ({ firstName, lastName, email, isOnline }) => {
  const { user } = useAuth();

  if (!firstName && !lastName && !email) {
    return (
      <div className="w-full h-full flex items-center justify-between px-6 border-b bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-300 to-gray-400"></div>
          <div className="font-semibold text-gray-400">Chat</div>
        </div>
      </div>
    );
  }

  const displayName = user?.is_staff
    ? (firstName && lastName ? `${firstName} ${lastName}` : email || "User")
    : "Support Team";

  return (
    <div className="w-full h-full flex items-center justify-between px-6 border-b bg-white shadow-sm">
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
            {displayName[0].toUpperCase()}
          </div>
          {isOnline !== undefined && (
            <div
              className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm transition-all duration-300 ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                }`}
            />
          )}
        </div>

        {user?.is_staff ? (
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-lg text-gray-900">
                {displayName}
              </div>
              {isOnline !== undefined && (
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium transition-colors duration-300 ${isOnline
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-600"
                  }`}>
                  {isOnline ? "Online" : "Offline"}
                </span>
              )}
            </div>
            {email && (
              <div className="text-sm text-gray-500">{email}</div>
            )}
          </div>
        ) : (
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-lg text-gray-900">
                {displayName}
              </div>
              {isOnline !== undefined && (
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-2 h-2 rounded-full transition-colors duration-300 ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                      }`}
                  />
                  <span className="text-xs text-gray-600">
                    {isOnline ? "Active now" : "Offline"}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {isOnline && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="font-medium">Active</span>
          </div>
        )}
      </div>
      
    </div>


  );
};

export default TopBar;