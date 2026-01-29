export const connectSocket = (conversationId, token) => {
  const ws = new WebSocket(
    `wss://localhost:8000/ws/chat/${conversationId}/?token=${token}`
  );

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  return ws;
};

export const disconnectSocket = (socket) => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close();
  }
};

export const sendMessage = (socket, message) => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'chat_message',
      text: message
    }));
  } else {
    console.error('Socket not connected');
  }
};

export const connectNotificationSocket = (token) => {
  const ws = new WebSocket(
    `wss://localhost:8000/ws/notifications/?token=${token}`
  );

  ws.onopen = () => {
    console.log('Notification WebSocket connected');
  };

  ws.onclose = () => {
    console.log('Notification WebSocket disconnected');
  };

  ws.onerror = (error) => {
    console.error('Notification WebSocket error:', error);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('New notification:', data.notification);ion
  };

  return ws;
};

export const disconnectNotificationSocket = (socket) => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close();
  }
};
