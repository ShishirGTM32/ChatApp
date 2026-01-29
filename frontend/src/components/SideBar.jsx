import React, { useState, useEffect } from "react";
import Button from "@mui/material/Button";
import { useQuery } from "@tanstack/react-query";
import axiosInstance from "../utils/AxiosInstance";
import CircularProgress from "@mui/material/CircularProgress";
import { toast } from "react-toastify";
import { MdLogout } from "react-icons/md";
import { useAuth } from "../context/AuthContext";

const DefaultAvatar = ({ name }) => (
  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
    {(name || "U")[0].toUpperCase()}
  </div>
);

const OnlineIndicator = ({ isOnline }) => (
  <div 
    className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm transition-all duration-300 ${
      isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
    }`}
  />
);



async function fetchConversations() {
  try {
    const response = await axiosInstance.get("/api/chat/conversation/");
    return response.data;
  } catch (err) {
    if (err.response?.status === 404) {
      return null;
    }
    throw new Error(err.response?.data?.message || "Failed to fetch conversations");
  }
}

const SideBar = ({ onSelectUser, selectedUser }) => {
  const { user: currentUser, logout } = useAuth();
  const [onlineStatuses, setOnlineStatuses] = useState({});
  
  const {
    data,
    isError,
    isLoading,
    refetch,
  } = useQuery({
    queryFn: fetchConversations,
    queryKey: ["conversations"],
    retry: false,
    refetchInterval: 5000,
  });

  // Update online statuses from data
  useEffect(() => {
    if (!data) return;

    const conversations = Array.isArray(data) ? data : [data];
    const newStatuses = {};

    conversations.forEach(conv => {
      if (currentUser?.is_staff) {
        // For staff, track user online status
        newStatuses[conv.user] = conv.is_online || false;
      } else {
        // For users, track staff online status
        newStatuses['staff'] = conv.is_online !== undefined ? conv.is_online : true;
      }
    });

    setOnlineStatuses(newStatuses);
  }, [data, currentUser?.is_staff]);

  useEffect(() => {
    if (!data || isLoading || currentUser?.is_staff) return;

    if (!Array.isArray(data) && data.cid) {
      const staffUser = {
        id: data.user,
        cid: data.cid,
        first_name: "Support",
        last_name: "Team",
        email: "support@chatapp.com",
        isOnline: data.is_online !== undefined ? data.is_online : true,
      };
      onSelectUser(staffUser);
    } 
  }, [data, isLoading, currentUser?.is_staff]);

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout();
    }
  };

  const handleStartConversation = async () => {
    try {
      const response = await axiosInstance.post("/api/chat/conversation/");
      if (response.status === 201) {
        toast.success("Conversation created! Send your first message to get started.");
        refetch();
      }
    } catch (error) {
      if (error.response?.status === 400) {
        toast.info("You already have a conversation. Send a message to get started!");
      } else {
        toast.error(error.response?.data?.detail || "Failed to start conversation");
      }
    }
  };

  const handleConversationClick = (conv) => {
    
    if (currentUser?.is_staff) {
      const userDetails = conv.user_details || {};
      const userId = conv.user;
      const conversationId = conv.cid;
      const isOnline = onlineStatuses[userId] || conv.is_online || false;
      
      
      const displayUser = {
        id: userId,
        cid: conversationId,
        first_name: userDetails.first_name || "User",
        last_name: userDetails.last_name || "",
        email: userDetails.email || "",
        isOnline: isOnline
      };
      
      onSelectUser(displayUser);
    } else {
      const isStaffOnline = onlineStatuses['staff'] !== undefined ? 
        onlineStatuses['staff'] : 
        (conv.is_online !== undefined ? conv.is_online : true);

      const staffUser = {
        id: conv.user,
        cid: conv.cid,
        first_name: "Support",
        last_name: "Team",
        email: "support@chatapp.com",
        isOnline: isStaffOnline,
      };
      onSelectUser(staffUser);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full bg-white">
        <CircularProgress />
      </div>
    );
  }

  if (isError) {
    toast.error("An error occurred in system");
  }

  const conversations = Array.isArray(data) ? data : (data ? [data] : []);

  if (!data || conversations.length === 0) {
    return (
      <div className="flex flex-col h-full bg-white shadow-lg">
        <div className="py-6 px-4 border-b bg-gradient-to-r from-blue-500 to-purple-600">
          <h1 className="text-2xl font-bold text-center text-white mb-1">Chat App</h1>
          <div className="text-sm text-center text-white opacity-90">
            {currentUser?.email}
          </div>
        </div>
        
        <div className="flex-1 flex flex-col justify-center items-center p-6">
          <div className="text-6xl mb-4">💬</div>
          <p className="text-gray-600 mb-2 text-center font-semibold text-lg">
            {currentUser?.is_staff 
              ? "No Active Conversations"
              : "Welcome to Chat Support!"
            }
          </p>
          <p className="text-gray-500 text-sm text-center mb-6 max-w-sm">
            {currentUser?.is_staff 
              ? "No users have started conversations yet. When a user sends their first message, their conversation will appear here."
              : "Start a conversation with our support team by sending your first message. Your chat will begin as soon as you send a message."
            }
          </p>
          {!currentUser?.is_staff && (
            <div className="text-center">
              <Button 
                variant="contained" 
                color="primary"
                onClick={handleStartConversation}
                sx={{ 
                  borderRadius: 2, 
                  textTransform: 'none', 
                  px: 4,
                  py: 1.5,
                  fontWeight: 600
                }}
              >
                Create Conversation
              </Button>
              <p className="text-xs text-gray-500 mt-3">
                Then send your first message below
              </p>
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50">
          <div className="mb-3">
            <div className="font-semibold text-gray-800 text-sm mb-1">
              {currentUser?.first_name} {currentUser?.last_name}
            </div>
            <div className="text-xs text-gray-600">{currentUser?.email}</div>
            {currentUser?.is_staff && (
              <div className="text-xs text-blue-600 mt-1 font-medium">Staff Account</div>
            )}
          </div>
          <Button
            variant="contained"
            color="error"
            fullWidth
            onClick={handleLogout}
            startIcon={<MdLogout />}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            Logout
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white shadow-lg">
      <div className="py-6 px-4 border-b bg-gradient-to-r from-blue-500 to-purple-600">
        <h1 className="text-2xl font-bold text-center text-white mb-2">
          {currentUser?.is_staff ? "Conversations" : "Chat"}
        </h1>
        <div className="text-sm text-center text-white opacity-90">
          {currentUser?.first_name} {currentUser?.last_name}
        </div>
        {currentUser?.is_staff && (
          <div className="text-xs text-center text-white opacity-75 mt-1">
            {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {conversations.map((conv) => {
          let displayUser;
          let userId;
          let lastMessage = null;
          let unreadCount = 0;
          let isOnline = false;
          
          if (currentUser?.is_staff) {
            const userDetails = conv.user_details || {};
            userId = conv.user;
            displayUser = {
              id: userId,
              cid: conv.cid,
              first_name: userDetails.first_name || "User",
              last_name: userDetails.last_name || "",
              email: userDetails.email || "",
            };
            lastMessage = conv.last_message;
            unreadCount = conv.unread_count || 0;
            isOnline = onlineStatuses[userId] || conv.is_online || false;
          } else {
            displayUser = {
              id: conv.user,
              cid: conv.cid,
              first_name: "Support",
              last_name: "Team",
              email: "support@chatapp.com",
            };
            userId = null;
            lastMessage = conv.last_message;
            isOnline = onlineStatuses['staff'] !== undefined ? 
              onlineStatuses['staff'] : 
              (conv.is_online !== undefined ? conv.is_online : true);
          }
          
          const isSelected = selectedUser?.cid === conv.cid;
          const displayName = displayUser.first_name && displayUser.last_name
            ? `${displayUser.first_name} ${displayUser.last_name}`
            : displayUser.email || "User";
          
          return (
            <div
              key={conv.cid}
              onClick={() => handleConversationClick(conv)}
              className={`p-3 rounded-xl cursor-pointer transition-all duration-200 transform ${
                isSelected 
                  ? "bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-400 shadow-md scale-[1.02]" 
                  : "bg-gray-50 hover:bg-gray-100 border-2 border-transparent hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <DefaultAvatar name={displayName} />
                  <OnlineIndicator isOnline={isOnline} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="font-semibold text-gray-900 truncate flex-1">
                      {displayName}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {unreadCount > 0 && (
                        <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                          {unreadCount > 5 ? '5+' : unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors duration-300 flex-shrink-0 ${
                        isOnline 
                          ? "bg-green-100 text-green-700" 
                          : "bg-gray-200 text-gray-600"
                      }`}>
                        {isOnline ? "Online" : "Offline"}
                      </span>
                      
                      {currentUser?.is_staff && (
                        <div className="text-xs text-gray-500 truncate">
                          {displayUser.email}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {lastMessage && (
                    <div className="mt-1">
                      <div className="text-xs text-gray-600 truncate">
                        <span className={`font-medium ${!lastMessage.is_read && currentUser?.is_staff && lastMessage.sender_id !== currentUser.id ? 'text-blue-600' : ''}`}>
                          {lastMessage.sender_name || "User"}:{" "}
                        </span>
                        <span className={`${!lastMessage.is_read && currentUser?.is_staff && lastMessage.sender_id !== currentUser.id ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                          {lastMessage.message}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t bg-gray-50">
        <div className="mb-3">
          <div className="font-semibold text-gray-800 text-sm mb-1">
            {currentUser?.first_name} {currentUser?.last_name}
          </div>
          <div className="text-xs text-gray-600">{currentUser?.email}</div>
          {currentUser?.is_staff && (
            <div className="text-xs text-blue-600 mt-1 font-medium">Staff Account</div>
          )}
        </div>
        <Button
          variant="contained"
          color="error"
          fullWidth
          onClick={handleLogout}
          startIcon={<MdLogout />}
          sx={{ 
            borderRadius: 2, 
            textTransform: 'none', 
            fontWeight: 600,
            boxShadow: 2,
            '&:hover': {
              boxShadow: 4
            }
          }}
        >
          Logout
        </Button>
      </div>
    </div>
  );
};

export default SideBar;