import React, { useState, useEffect, useRef } from "react";
import SideBar from "./SideBar";
import TopBar from "./TopBar";
import IntegratedChatInterface from "./MessageBar";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";




const ChatApp = () => {
  const location = useLocation();
  const { tokens, user } = useAuth();
  const [selectedUser, setSelectedUser] = useState(() => {
    return location.state?.selectedUser ?? null;
  });
  const [conversationId, setConversationId] = useState(null);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [onlineStatus, setOnlineStatus] = useState(false);
  const [hasConversation, setHasConversation] = useState(null);
  const heartbeatIntervalRef = useRef(null);
  const [notificationSocket, setNotificationSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const unreadNotifications = notifications.filter(n => !n.is_read);
  const readNotifications = notifications.filter(n => n.is_read);

  const Notifications = ({ unreadNotifications, readNotifications, markNotificationRead }) => {
    const [showNotifications, setShowNotifications] = useState(false);

    return (
      <div className="relative">
        {/* Notification button */}
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 focus:outline-none"
        >
          🔔
          {unreadNotifications.length > 0 && (
            <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 bg-red-600 rounded-full">
              {unreadNotifications.length}
            </span>
          )}
        </button>

        {/* Notification dropdown */}
        {showNotifications && (
          <div className="absolute right-0 mt-2 w-64 bg-white border rounded shadow-lg z-50 max-h-60 overflow-y-auto">
            <div className="p-2">
              {/* Unread */}
              <div className="font-semibold text-gray-600 mb-1">Unread</div>
              {unreadNotifications.length > 0 ? (
                unreadNotifications.map((n) => (
                  <div
                    key={n.nid}
                    className="text-sm py-1 border-b cursor-pointer hover:bg-gray-100"
                    onClick={() => markNotificationRead(n.nid)}
                  >
                    {n.notification}
                  </div>
                ))
              ) : (
                <div className="text-gray-400 text-sm mb-2">No unread notifications</div>
              )}

              {/* Read */}
              <div className="font-semibold text-gray-600 mt-2 mb-1">Read</div>
              {readNotifications.length > 0 ? (
                readNotifications.map((n) => (
                  <div key={n.nid} className="text-sm py-1 border-b text-gray-500">
                    {n.notification}
                  </div>
                ))
              ) : (
                <div className="text-gray-400 text-sm">No read notifications</div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (user === null) return;

    if (user?.is_staff === false && tokens?.access) {
      checkUserConversation();
    } else if (user?.is_staff === true) {
      setHasConversation(null);
    }
  }, [user, tokens?.access]);

  const checkUserConversation = async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/chat/conversation/`,
        {
          headers: {
            Authorization: `Bearer ${tokens.access}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setHasConversation(true);

        const convId = data.cid;
        setConversationId(convId);
      } else if (response.status === 404) {
        setHasConversation(false);
        setConversationId(null);
      }
    } catch (error) {
      console.error("Failed to check conversation:", error);
      setHasConversation(false);
    }
  };

  const fetchNotifications = async () => {
    if (!tokens?.access) return;
    try {
      const response = await fetch("http://127.0.0.1:8000/api/chat/notifications/", {
        headers: {
          Authorization: `Bearer ${tokens.access}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setNotifications(data);
      } else {
        console.error("Failed to fetch notifications:", response.status);
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [tokens?.access]);

  const markNotificationRead = (notificationId) => {
    if (notificationSocket && notificationSocket.readyState === WebSocket.OPEN) {
      notificationSocket.send(JSON.stringify({
        type: "read_notification",
        id: notificationId,
      }));
    }

    // Update locally
    setNotifications(prev =>
      prev.map(n => n.nid === notificationId ? { ...n, read: true } : n)
    );
  };


  useEffect(() => {
    if (!tokens?.access || !user) return;

    if (notificationSocket) {
      notificationSocket.close();
      setNotificationSocket(null);
    }

    const ws = new WebSocket(`ws://localhost:8000/ws/notifications/?token=${tokens.access}`);

    ws.onopen = () => {
      console.log("Notification WebSocket connected");
      setNotificationSocket(ws);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "notification") {
        setNotifications(prev => [data.notification, ...prev]);
      } else if (data.type === "read") {
        setNotifications(prev =>
          prev.map(n =>
            n.nid === data.notification_id ? { ...n, is_read: true } : n
          )
        );
      }
    };


    ws.onerror = (error) => {
      console.error("Notification WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("Notification WebSocket disconnected");
      setNotificationSocket(null);
    };

    return () => {
      ws.close();
    };
  }, [tokens?.access, user]);

  useEffect(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      heartbeatIntervalRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify({ type: "heartbeat" }));
          } catch (error) {
            console.error("Error sending heartbeat:", error);
          }
        } else {
          console.warn("Socket not open, clearing heartbeat interval");
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
          }
        }
      }, 28000);
    }

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [socket]);

  useEffect(() => {
    if (!tokens?.access || !user) {
      return;
    }

    if (socket) {
      socket.close();
      setSocket(null);
    }

    if (user?.is_staff === true && !selectedUser?.cid) {
      setConversationId(null);
      setSocket(null);
      setOnlineStatus(false);
      return;
    }

    if (user?.is_staff === false && !conversationId) {
      setSocket(null);
      setOnlineStatus(false);
      return;
    }

    const initializeWebSocket = async () => {
      setLoading(true);
      try {
        let convId = null;

        if (user.is_staff === true) {
          convId = selectedUser.cid;
        } else {
          convId = conversationId;
        }

        if (convId) {
          const ws = new WebSocket(
            `ws://localhost:8000/ws/chat/${convId}/?token=${tokens.access}`
          );

          ws.onopen = () => {
            setSocket(ws);
            setLoading(false);
          };

          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);

              if (data.type === "heartbeat_ack") {

              }

              if (data.type === "user_status") {
                if (user.is_staff && String(data.user_id) === String(selectedUser.id)) {
                  setOnlineStatus(data.status === "online");
                } else if (!user.is_staff && data.is_staff) {
                  setOnlineStatus(data.status === "online");
                }
              }

              if (data.type === "online_users") {
                if (user.is_staff && selectedUser) {
                  const isUserOnline = data.users.some(u => String(u.id) === String(selectedUser.id));
                  setOnlineStatus(isUserOnline);
                } else if (!user.is_staff) {
                  const isStaffOnline = data.users.some(u => u.is_staff);
                  setOnlineStatus(isStaffOnline);
                }
              }
            } catch (error) {
              console.error("Error parsing WebSocket message:", error);
            }
          };

          ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            setSocket(null);
            setLoading(false);
          };

          ws.onclose = () => {
            setOnlineStatus(false);
            setSocket(null);
            setLoading(false);
          };
        } else {
          setSocket(null);
          setOnlineStatus(false);
          setLoading(false);
        }
      } catch (error) {
        console.error("Failed to initialize WebSocket:", error);
        setSocket(null);
        setLoading(false);
      }
    };

    initializeWebSocket();

    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [selectedUser?.cid, conversationId, tokens?.access, user?.is_staff, user]);

  useEffect(() => {
    if (selectedUser?.isOnline !== undefined) {
      setOnlineStatus(selectedUser.isOnline);
    }
  }, [selectedUser?.isOnline]);

  const handleConversationCreated = (newConvId) => {
    setConversationId(newConvId);
    setHasConversation(true);
  };

  const activeConversationId = user?.is_staff === true ? selectedUser?.cid : conversationId;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <div className="w-80 h-full shadow-lg">
        <SideBar onSelectUser={setSelectedUser} selectedUser={selectedUser} />
      </div>
      <Notifications
        unreadNotifications={unreadNotifications}
        readNotifications={readNotifications}
        markNotificationRead={markNotificationRead}
      />
      <div className="flex flex-col flex-1 h-full">
        <div className="h-16 bg-white shadow-sm">
          <TopBar
            firstName={selectedUser?.first_name || ""}
            lastName={selectedUser?.last_name || ""}
            email={selectedUser?.email || ""}
            isOnline={onlineStatus}
          />
        </div>




        <div className="flex-1 overflow-hidden bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <div className="text-gray-500">Loading conversation...</div>
              </div>
            </div>
          ) : !selectedUser && user?.is_staff === true ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-400">
                <div className="text-xl font-medium">Select a conversation</div>
                <div className="text-sm mt-2">Choose a user from the sidebar to view their messages</div>
              </div>
            </div>
          ) : (
            <IntegratedChatInterface
              userId={selectedUser?.id || user?.id}
              conversationId={activeConversationId}
              socket={socket}
              onConversationCreated={handleConversationCreated}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatApp;