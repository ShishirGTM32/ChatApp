import React, { useState, useEffect, useRef, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import axiosInstance from "../utils/AxiosInstance.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { BsCheckAll, BsCheck, BsClock } from "react-icons/bs";
import { IoSend } from "react-icons/io5";
import { toast } from "react-toastify";
import InputBar from "./InputBar.jsx";
import ImageMessage from "./ImageMessage.jsx";

const MESSAGE_STATUS = {
  SENDING: 'sending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read'
};

const IntegratedChatInterface = ({ userId, conversationId, socket, onConversationCreated }) => {
  const { user } = useAuth();
  const [liveMessages, setLiveMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollRef = useRef(null);
  const lastConversationIdRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const observerTarget = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastSocketRef = useRef(null);
  const initialScrollDoneRef = useRef(false);

  const scrollToBottom = (behavior = 'smooth') => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: behavior
      });
    }
  };

  const convertUTCtoNepal = (utcTimestamp) => {
    const date = new Date(utcTimestamp);
    date.setHours(date.getHours() + 5);
    date.setMinutes(date.getMinutes() + 45);
    return date.toISOString();
  };

  const formatTime = (timestamp) => {
    const timePart = timestamp.split("T")[1];
    if (!timePart) return "";
    return timePart.slice(0, 5);
  };

  const formatDateHeader = (timestamp) => {
    const [datePart] = timestamp.split("T");
    const messageDate = new Date(datePart);
    const now = new Date();

    if (messageDate.toDateString() === now.toDateString()) {
      return "Today";
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (messageDate.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }

    const options = { month: "long", day: "numeric" };
    if (messageDate.getFullYear() !== now.getFullYear()) {
      options.year = "numeric";
    }

    return messageDate.toLocaleDateString(undefined, options);
  };

  const renderMessageContent = (msg) => {
  if (msg.image || msg.message_type === "IMAGE") {
    return (
      <ImageMessage
        publicId={msg.image} 
        message={msg.message}
        isLoading={msg.isOptimistic}
        localFile={msg.localFile}
      />
    );
  }

  return (
    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
      {msg.message}
    </p>
  );
};



  useEffect(() => {
    if (conversationId !== lastConversationIdRef.current) {
      setLiveMessages([]);
      setTypingUsers(new Map());
      lastConversationIdRef.current = conversationId;
      isAtBottomRef.current = true;
      initialScrollDoneRef.current = false;
    }
  }, [conversationId]);

  useEffect(() => {
    if (!socket || !conversationId) return;

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "chat_message" && conversationId === lastConversationIdRef.current) {
          setLiveMessages((prev) => {
            const nepaliTimestamp = convertUTCtoNepal(data.timestamp);

            const optimisticIndex = prev.findIndex(
              msg => msg.isOptimistic && msg.message === data.message &&
                String(msg.sender) === String(data.sender)
            );

            if (optimisticIndex !== -1) {
              return prev.map((msg, idx) =>
                idx === optimisticIndex
                  ? {
                    ...msg,
                    mid: data.message_id,
                    timestamp: nepaliTimestamp,
                    status: data.status || MESSAGE_STATUS.SENT,
                    is_read: data.is_read || false,
                    isOptimistic: false
                  }
                  : msg
              );
            }

            const existingIndex = prev.findIndex(msg => msg.mid === data.message_id);

            if (existingIndex !== -1) {
              return prev.map((msg, idx) =>
                idx === existingIndex
                  ? {
                    ...msg,
                    timestamp: nepaliTimestamp,
                    status: data.status || (data.is_read ? MESSAGE_STATUS.READ : MESSAGE_STATUS.SENT),
                    is_read: data.is_read || false,
                  }
                  : msg
              );
            }
            const newMessage = {
              mid: data.message_id,
              message: data.message,
              sender: data.sender,
              sender_name: data.sender_name,
              sender_email: data.sender_email,
              timestamp: nepaliTimestamp,
              status: data.status || MESSAGE_STATUS.DELIVERED,
              is_read: data.is_read || false,
            };

            return [...prev, newMessage];
          });

          if (isAtBottomRef.current) {
            setTimeout(() => {
              requestAnimationFrame(() => {
                if (scrollRef.current) {
                  scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
              });
            }, 50);
          }
        }
        else if (data.type === "image_message" && conversationId === lastConversationIdRef.current) {
          setLiveMessages((prev) => {
            const nepaliTimestamp = convertUTCtoNepal(data.timestamp);

            const optimisticIndex = prev.findIndex(
              msg => msg.isOptimistic &&
                msg.message_type === "IMAGE" &&
                String(msg.sender) === String(data.sender)
            );

            if (optimisticIndex !== -1) {
              return prev.map((msg, idx) =>
                idx === optimisticIndex
                  ? {
                    ...msg,
                    mid: data.message_id,
                    image: data.image,
                    timestamp: nepaliTimestamp,
                    status: data.status || MESSAGE_STATUS.SENT,
                    is_read: data.is_read || false,
                    isOptimistic: false,
                    localFile: data.image ? null : msg.localFile
                  }
                  : msg
              );
            }

            const existingIndex = prev.findIndex(msg => msg.mid === data.message_id);
            if (existingIndex !== -1) {
              return prev.map((msg, idx) =>
                idx === existingIndex
                  ? {
                    ...msg,
                    image: data.image,
                    timestamp: nepaliTimestamp,
                    status: data.status || (data.is_read ? MESSAGE_STATUS.READ : MESSAGE_STATUS.DELIVERED),
                    is_read: data.is_read || false,
                    localFile: null
                  }
                  : msg
              );
            }
            const newMessage = {
              mid: data.message_id,
              message: data.message || "",
              image: data.image,
              message_type: "IMAGE",
              sender: data.sender,
              sender_name: data.sender_name,
              sender_email: data.sender_email,
              timestamp: nepaliTimestamp,
              status: data.status || MESSAGE_STATUS.DELIVERED,
              is_read: data.is_read || false,
            };

            return [...prev, newMessage];
          });

          if (isAtBottomRef.current) {
            setTimeout(() => {
              requestAnimationFrame(() => {
                if (scrollRef.current) {
                  scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
              });
            }, 50);
          }
        }
        else if (data.type === "read") {
          setLiveMessages(prev =>
            prev.map(msg =>
              String(msg.sender) === String(user?.id)
                ? {
                  ...msg,
                  status: MESSAGE_STATUS.READ,
                  is_read: true
                }
                : msg
            )
          );
        }
        else if (data.type === "status_upgrade") {
          const recipientId = data.recipient_id;
          const newStatus = data.new_status;

          setLiveMessages(prev =>
            prev.map(msg => {
              const isOurMessage = String(msg.sender) === String(user?.id);
              const canUpgrade = msg.status === MESSAGE_STATUS.SENT;

              if (isOurMessage && canUpgrade && newStatus === "delivered") {
                return { ...msg, status: MESSAGE_STATUS.DELIVERED };
              }
              return msg;
            })
          );
        }
        else if (data.type === "user_status") {
          const isRecipientStatusChange = user.is_staff
            ? String(data.user_id) === String(selectedUser?.id)
            : data.is_staff;

          if (isRecipientStatusChange && data.status === "online") {
            setLiveMessages(prev =>
              prev.map(msg =>
                String(msg.sender) === String(user?.id) && msg.status === MESSAGE_STATUS.SENT
                  ? { ...msg, status: MESSAGE_STATUS.DELIVERED }
                  : msg
              )
            );
          }
        }
        else if (data.type === "typing") {
          setTypingUsers(prev => {
            const newMap = new Map(prev);
            if (data.is_typing) {
              newMap.set(data.user_id, data.sender_name);
            } else {
              newMap.delete(data.user_id);
            }
            return newMap;
          });
        }
      } catch (err) {
        console.error("WebSocket parse error:", err);
      }
    };

    socket.addEventListener("message", handleMessage);
    return () => socket.removeEventListener("message", handleMessage);
  }, [socket, conversationId, user?.id]);


  const fetchMessages = async ({ pageParam }) => {
    if (!conversationId) {
      return { results: [], next: null, previous: null };
    }

    try {
      const url = pageParam
        ? `/api/chat/conversation/${conversationId}/messages/?cursor=${pageParam}`
        : `/api/chat/conversation/${conversationId}/messages/`;

      const response = await axiosInstance.get(url);

      const messagesWithStatus = response.data.results.map(msg => ({
        ...msg,
        status: msg.is_read ? MESSAGE_STATUS.READ : MESSAGE_STATUS.SENT
      }));

      return { ...response.data, results: messagesWithStatus };
    } catch (err) {
      console.error("Error fetching messages:", err);
      return { results: [], next: null, previous: null };
    }
  };

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["chatMessages", conversationId],
    queryFn: fetchMessages,
    enabled: !!conversationId,
    initialPageParam: null,
    getNextPageParam: (lastPage) => {
      if (!lastPage.next) return undefined;
      try {
        const url = new URL(lastPage.next);
        return url.searchParams.get('cursor');
      } catch {
        return undefined;
      }
    },
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const combinedMessages = useMemo(() => {
    const allPages = data?.pages || [];
    const historicalMessages = allPages.flatMap(page => page.results || []);

    const messagesMap = new Map();

    historicalMessages.forEach(msg => {
      messagesMap.set(msg.mid, { ...msg, source: 'historical' });
    });

    liveMessages.forEach((msg, index) => {
      const existing = messagesMap.get(msg.mid);

      if (!existing || msg.isOptimistic) {
        messagesMap.set(msg.mid, { ...msg, source: 'live', liveIndex: index });
      } else {
        messagesMap.set(msg.mid, { ...existing, ...msg, source: 'live', liveIndex: index });
      }
    });

    const uniqueMessages = Array.from(messagesMap.values());
    uniqueMessages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return uniqueMessages;
  }, [data?.pages, liveMessages]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          const currentScrollHeight = scrollRef.current?.scrollHeight;
          const currentScrollTop = scrollRef.current?.scrollTop;

          fetchNextPage().then(() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (scrollRef.current) {
                  const newScrollHeight = scrollRef.current.scrollHeight;
                  const heightDifference = newScrollHeight - currentScrollHeight;
                  scrollRef.current.scrollTop = currentScrollTop + heightDifference;
                }
              });
            });
          });
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const checkIfAtBottom = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isBottom = scrollHeight - scrollTop - clientHeight < 100;
      isAtBottomRef.current = isBottom;
      setShowScrollButton(!isBottom);
    }
  };

  useEffect(() => {
    if (socket && socket.readyState === WebSocket.OPEN && combinedMessages.length > 0) {
      const hasUnreadFromOthers = combinedMessages.some(
        msg => !msg.is_read && String(msg.sender) !== String(user?.id)
      );

      if (hasUnreadFromOthers) {
        socket.send(JSON.stringify({ type: "read" }));
      }
    }
  }, [combinedMessages.length, socket, user?.id]);

  useEffect(() => {
    if (conversationId && scrollRef.current && !isLoading && !initialScrollDoneRef.current) {
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          isAtBottomRef.current = true;
          initialScrollDoneRef.current = true;
        }
      }, 100);
    }
  }, [conversationId, isLoading]);

  const sendTypingIndicator = (typing) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: "typing", is_typing: typing }));
      } catch (error) {
        console.error("Error sending typing indicator:", error);
      }
    }
  };

  useEffect(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (message.trim() && !isTyping) {
      setIsTyping(true);
      sendTypingIndicator(true);
    }

    if (message.trim()) {
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        sendTypingIndicator(false);
      }, 1000);
    } else if (isTyping) {
      setIsTyping(false);
      sendTypingIndicator(false);
    }

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [message]);

  useEffect(() => {
    lastSocketRef.current = socket;

    return () => {
      if (isTyping && lastSocketRef.current) {
        try {
          if (lastSocketRef.current.readyState === WebSocket.OPEN) {
            lastSocketRef.current.send(JSON.stringify({ type: "typing", is_typing: false }));
          }
        } catch (error) {
          console.error("Error cleaning up typing indicator:", error);
        }
      }
    };
  }, [socket, isTyping]);

  const groupMessagesByDate = (messages) => {
    const groups = new Map();

    messages.forEach(msg => {
      const dateKey = msg.timestamp.split('T')[0];
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey).push(msg);
    });

    const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    return sortedGroups.map(([dateKey, msgs]) => [formatDateHeader(msgs[0].timestamp), msgs]);
  };

  const groupConsecutiveMessages = (messages) => {
    const grouped = [];
    let currentGroup = null;

    messages.forEach((msg) => {
      const lastMsg = currentGroup?.messages[currentGroup.messages.length - 1];
      const isSameUser = currentGroup && String(currentGroup.sender) === String(msg.sender);

      let timeDiff = false;
      if (lastMsg) {
        const parseHHMM = (ts) => {
          const timePart = ts.split("T")[1]?.slice(0, 5);
          if (!timePart) return 0;
          const [h, m] = timePart.split(":").map(Number);
          return h * 60 + m;
        };

        const lastMinutes = parseHHMM(lastMsg.timestamp);
        const currentMinutes = parseHHMM(msg.timestamp);

        timeDiff = (currentMinutes - lastMinutes) < 5;
      }

      if (isSameUser && timeDiff) {
        currentGroup.messages.push(msg);
      } else {
        if (currentGroup) grouped.push(currentGroup);
        currentGroup = {
          sender: msg.sender,
          sender_name: msg.sender_name,
          sender_email: msg.sender_email,
          messages: [msg],
        };
      }
    });

    if (currentGroup) grouped.push(currentGroup);
    return grouped;
  };

  const createConversationAndSend = async (messageText) => {
    try {
      const tokens = JSON.parse(localStorage.getItem("tokens"));
      if (!tokens?.access) {
        toast.error("No auth token available");
        throw new Error("No auth token");
      }

      const response = await axiosInstance.post("/api/chat/conversation/", {});
      const newConvId = response.data.cid;

      if (onConversationCreated) {
        onConversationCreated(newConvId);
      }

      await new Promise(resolve => setTimeout(resolve, 1500));

      const parentSocket = socket;
      if (parentSocket && parentSocket.readyState === WebSocket.OPEN) {
        parentSocket.send(JSON.stringify({ type: "chat_message", text: messageText }));
        toast.success("Message sent!");
        return;
      }

      const ws = new WebSocket(
        `ws://localhost:8000/ws/chat/${newConvId}/?token=${tokens.access}`
      );

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("WebSocket connection timeout"));
        }, 5000);

        ws.onopen = () => {
          clearTimeout(timeout);

          try {
            ws.send(JSON.stringify({ type: "chat_message", text: messageText }));
            toast.success("Conversation started!");
            setTimeout(() => ws.close(), 1000);
            resolve();
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error("Temporary WebSocket error:", error);
          reject(error);
        };
      });
    } catch (error) {
      console.error("Failed to create conversation and send message:", error);
      toast.error(error.message || "Failed to send message");
      throw error;
    }
  };

  const createConversationAndSendImage = async (imageData) => {
    try {
      const tokens = JSON.parse(localStorage.getItem("tokens"));
      if (!tokens?.access) {
        toast.error("No auth token available");
        throw new Error("No auth token");
      }

      const response = await axiosInstance.post("/api/chat/conversation/", {});
      const newConvId = response.data.cid;

      if (onConversationCreated) {
        onConversationCreated(newConvId);
      }

      await new Promise(resolve => setTimeout(resolve, 1500));

      const ws = new WebSocket(
        `ws://localhost:8000/ws/chat/${newConvId}/?token=${tokens.access}`
      );

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("WebSocket connection timeout"));
        }, 5000);

        ws.onopen = () => {
          clearTimeout(timeout);

          try {
            ws.send(JSON.stringify({
              type: "image",
              image: imageData.image, // B2 file name
              text: imageData.text || ""
            }));
            setTimeout(() => ws.close(), 1000);
            resolve();
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error("Temporary WebSocket error:", error);
          reject(error);
        };
      });
    } catch (error) {
      console.error("Failed to create conversation and send image:", error);
      toast.error(error.message || "Failed to send image");
      throw error;
    }
  };

  useEffect(() => {
    if (conversationId && scrollRef.current && !isLoading && !initialScrollDoneRef.current && combinedMessages.length > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            isAtBottomRef.current = true;
            initialScrollDoneRef.current = true;
          }
        });
      });
    }
  }, [conversationId, isLoading, combinedMessages.length]);

  useEffect(() => {
    if (liveMessages.length > 0 && isAtBottomRef.current && scrollRef.current && initialScrollDoneRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [liveMessages.length]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!message.trim()) return;

    const messageText = message.trim();

    if (isTyping) {
      setIsTyping(false);
      sendTypingIndicator(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }

    if (!user) {
      toast.error("Please wait, loading user info...");
      return;
    }

    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimisticMessage = {
      mid: tempId,
      message: messageText,
      message_type: "TEXT",
      sender: user.id,
      sender_name: user.name || `${user.first_name} ${user.last_name}`.trim() || user.email,
      sender_email: user.email,
      timestamp: new Date().toISOString(),
      status: MESSAGE_STATUS.SENDING,
      is_read: false,
      isOptimistic: true
    };

    setLiveMessages(prev => [...prev, optimisticMessage]);
    setMessage("");
    setSending(true);
    isAtBottomRef.current = true;

    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 0);

    try {
      if (user.is_staff) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          toast.error("Connection lost");
          setLiveMessages(prev => prev.filter(msg => msg.mid !== tempId));
          setSending(false);
          return;
        }
        socket.send(JSON.stringify({ type: "chat_message", text: messageText }));
        // Server will respond with actual status (sent/delivered)
      } else {
        if (!conversationId || !socket) {
          setLiveMessages(prev => prev.filter(msg => msg.mid !== tempId));
          await createConversationAndSend(messageText);
        } else {
          if (socket.readyState !== WebSocket.OPEN) {
            toast.error("Connection lost");
            setLiveMessages(prev => prev.filter(msg => msg.mid !== tempId));
            setSending(false);
            return;
          }
          socket.send(JSON.stringify({ type: "chat_message", text: messageText }));
        }
      }
    } catch (err) {
      toast.error("Failed to send message");
      console.error(err);
      setLiveMessages(prev => prev.filter(msg => msg.mid !== tempId));
    } finally {
      setSending(false);
    }
  };



  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleMessageChange = (e) => {
    setMessage(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
  };

  const renderStatusIcon = (message) => {
    if (String(message.sender) !== String(user?.id)) {
      return null;
    }

    switch (message.status) {
      case MESSAGE_STATUS.SENDING:
        return <BsClock className="text-gray-400" size={14} />;
      case MESSAGE_STATUS.SENT:
        return <BsCheck className="text-gray-400" size={16} />;
      case MESSAGE_STATUS.DELIVERED:
        return <BsCheckAll className="text-gray-400" size={16} />;
      case MESSAGE_STATUS.READ:
        return <BsCheckAll className="text-blue-500" size={16} />;
      default:
        return <BsCheck className="text-gray-400" size={16} />;
    }
  };

  const renderMessagesByDate = (combinedMessages, user) => {
    const dateGroups = groupMessagesByDate(combinedMessages);

    return dateGroups.map(([date, messages]) => (
      <div key={date} className="space-y-1">
        <div className="flex items-center justify-center py-4">
          <div className="bg-gray-200 rounded-full px-4 py-1 text-xs text-gray-600 font-medium">
            {date}
          </div>
        </div>

        {groupConsecutiveMessages(messages).map((group, groupIndex) => {
          const isSentByMe = String(group.sender) === String(user?.id);
          const lastMessage = group.messages[group.messages.length - 1];

          const totalChars = group.messages.reduce((sum, msg) => sum + (msg.message?.length || 0), 0);
          const avgChars = totalChars / group.messages.length;
          const spacing = avgChars > 100 ? "mb-4" : avgChars > 50 ? "mb-3" : "mb-2";

          return (
            <div
              key={`${group.sender}-${groupIndex}`}
              className={`flex ${isSentByMe ? "justify-end" : "justify-start"} ${spacing}`}
            >
              <div className={`flex flex-col ${isSentByMe ? "items-end" : "items-start"} max-w-[70%]`}>
                {!isSentByMe && (
                  <div className="text-xs text-gray-500 mb-1 px-1">
                    {group.sender_name}
                  </div>
                )}

                <div className="space-y-1">
                  {group.messages.map((msg) => (
                    <div
                      key={msg.mid}
                      className={`px-4 py-2 rounded-2xl ${isSentByMe
                        ? "bg-blue-500 text-white rounded-br-md"
                        : "bg-gray-200 text-gray-800 rounded-bl-md"
                        } ${msg.isOptimistic ? "opacity-70" : ""}`}
                    >
                      {renderMessageContent(msg)}
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-1 mt-1 px-1">
                  <span className="text-xs text-gray-500">
                    {formatTime(lastMessage.timestamp)}
                  </span>
                  {renderStatusIcon(lastMessage)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    ));
  };

  if (!conversationId && !user?.is_staff) {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p className="text-lg mb-2">Start a conversation</p>
            <p className="text-sm">Send a message to begin chatting</p>
          </div>
        </div>

        <div className="border-t bg-white p-4">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                value={message}
                onChange={handleMessageChange}
                onKeyDown={handleKeyPress}
                placeholder="Type a message..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none overflow-hidden"
                style={{ minHeight: '40px', maxHeight: '128px' }}
                rows={1}
              />
            </div>
            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <IoSend size={20} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div
        ref={scrollRef}
        onScroll={checkIfAtBottom}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
      >
        {hasNextPage && (
          <div ref={observerTarget} className="flex justify-center py-2">
            {isFetchingNextPage && (
              <div className="text-sm text-gray-500">Loading more messages...</div>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : combinedMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <p className="text-lg mb-2">No messages yet</p>
              <p className="text-sm">Start the conversation!</p>
            </div>
          </div>
        ) : (
          renderMessagesByDate(combinedMessages, user)
        )}

        {typingUsers.size > 0 && (
          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-2xl px-4 py-2 rounded-bl-md">
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-600">
                  {Array.from(typingUsers.values()).join(", ")} {typingUsers.size === 1 ? "is" : "are"} typing
                </span>
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showScrollButton && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-24 right-8 bg-white shadow-lg rounded-full p-3 hover:bg-gray-100 transition-colors z-10"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      <InputBar
        user={user}
        socket={socket}
        conversationId={conversationId}
        onSendMessage={(msg) => setLiveMessages(prev => [...prev, msg])}
        createConversationAndSendImage={createConversationAndSendImage}
      />
    </div>
  );
};

export default IntegratedChatInterface;
