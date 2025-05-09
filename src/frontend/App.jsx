import { useState, useEffect, useRef } from "react";
import { FiPlus, FiTrash2, FiPlay, FiRefreshCw } from "react-icons/fi";

const AIConversationSimulator = () => {
  const [agentPrompt, setAgentPrompt] = useState("");
  const [userPrompts, setUserPrompts] = useState([{ id: 1, content: "", selected: true }]);
  const [conversations, setConversations] = useState([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const websocketRef = useRef(null);
  const clientIdRef = useRef(`client-${Date.now()}`);

  // Initialize WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      // Hardcode the WebSocket URL for testing
      const wsUrl = 'ws://103.253.20.13:25050';
      const ws = new WebSocket(`${wsUrl}/ws/${clientIdRef.current}`);
      
      ws.onopen = () => {
        console.log("WebSocket connected");
        setConnectionStatus("connected");
      };
      
      ws.onclose = () => {
        console.log("WebSocket disconnected");
        setConnectionStatus("disconnected");
        // Try to reconnect after 2 seconds
        setTimeout(connectWebSocket, 2000);
      };
      
      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setConnectionStatus("error");
      };
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("Message received:", data);
        
        if (data.type === "conversations_created") {
          // Initialize new conversations
          const newConversations = data.conversations.map(conv => ({
            id: conv.id,
            userPromptId: conv.userPromptId,
            status: conv.status,
            messages: []
          }));
          
          setConversations(prev => [...prev, ...newConversations]);
        } 
        else if (data.type === "message") {
          // Add new message to the appropriate conversation
          setConversations(prev => 
            prev.map(conv => 
              conv.id === data.conversation_id
                ? {
                    ...conv,
                    messages: [...conv.messages, {
                      role: data.message.role,
                      content: data.message.content,
                      timestamp: data.message.timestamp
                    }]
                  }
                : conv
            )
          );
        }
        else if (data.type === "completion") {
          // Mark conversation as completed
          setConversations(prev => 
            prev.map(conv => 
              conv.id === data.conversation_id
                ? { ...conv, status: "completed" }
                : conv
            )
          );
        }
      };
      
      websocketRef.current = ws;
      
      return () => {
        ws.close();
      };
    };
    
    connectWebSocket();
    
    return () => {
      if (websocketRef.current) {
        websocketRef.current.close();
      }
    };
  }, []);

  const addNewPrompt = () => {
    setUserPrompts([...userPrompts, { id: Date.now(), content: "", selected: true }]);
  };

  const togglePromptSelection = (id) => {
    setUserPrompts(userPrompts.map(prompt =>
      prompt.id === id ? { ...prompt, selected: !prompt.selected } : prompt
    ));
  };

  const updatePromptText = (id, content) => {
    setUserPrompts(userPrompts.map(prompt =>
      prompt.id === id ? { ...prompt, content } : prompt
    ));
  };

  const deletePrompt = (id) => {
    setUserPrompts(userPrompts.filter(prompt => prompt.id !== id));
  };

  const startSimulation = () => {
    if (!agentPrompt.trim()) {
      alert("Please enter an agent prompt");
      return;
    }
    
    const selectedPrompts = userPrompts.filter(p => p.selected && p.content.trim());
    if (selectedPrompts.length === 0) {
      alert("Please select at least one user prompt");
      return;
    }
    
    setIsSimulating(true);
    
    // Clear previous conversations
    setConversations([]);
    
    // Send start message to server
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify({
        type: "start_conversation",
        agent_prompt: agentPrompt,
        user_prompts: selectedPrompts
      }));
    } else {
      alert("WebSocket connection not ready. Please try again.");
      setIsSimulating(false);
    }
  };

  const resetSimulation = () => {
    setConversations([]);
    setUserPrompts([{ id: 1, content: "", selected: true }]);
    setAgentPrompt("");
    setIsSimulating(false);
  };

  return (
    <div className={`min-h-screen p-4 ${isDarkMode ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"}`}>
      <div className="max-w-6xl mx-auto">
        {/* Header Controls */}
        <div className="flex justify-between mb-4 items-center">
          <div className={`px-3 py-1 rounded ${
            connectionStatus === "connected" ? "bg-green-500" : 
            connectionStatus === "disconnected" ? "bg-red-500" : "bg-yellow-500"
          } text-white`}>
            {connectionStatus === "connected" ? "Connected" : 
             connectionStatus === "disconnected" ? "Disconnected" : "Connecting..."}
          </div>
          
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white"
          >
            {isDarkMode ? "Light Mode" : "Dark Mode"}
          </button>
        </div>

        {/* Agent Prompt Input */}
        <div className="sticky top-0 z-10 bg-opacity-95 p-4 rounded-lg shadow-lg mb-6"
          style={{ backgroundColor: isDarkMode ? "#1a1a1a" : "#ffffff" }}
        >
          <textarea
            value={agentPrompt}
            onChange={(e) => setAgentPrompt(e.target.value)}
            placeholder="Enter Agent Prompt"
            className={`w-full p-4 rounded-lg border-2 focus:ring-2 focus:ring-blue-500 outline-none ${isDarkMode ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200 text-black"}`}
            rows="4"
            disabled={isSimulating}
          />
        </div>

        {/* User Prompts Section */}
        <div className={`p-6 rounded-lg mb-6 ${isDarkMode ? "bg-gray-800" : "bg-white"} shadow-lg`}>
          <h2 className="text-xl font-bold mb-4">User Prompts</h2>
          <div className="space-y-4">
            {userPrompts.map((prompt) => (
              <div key={prompt.id} className="flex items-center gap-4">
                <input
                  type="checkbox"
                  checked={prompt.selected}
                  onChange={() => togglePromptSelection(prompt.id)}
                  className="w-5 h-5 rounded text-blue-500"
                  disabled={isSimulating}
                />
                <input
                  type="text"
                  value={prompt.content}
                  onChange={(e) => updatePromptText(prompt.id, e.target.value)}
                  placeholder={`User Prompt ${prompt.id}`}
                  className={`flex-1 p-2 rounded-lg border ${isDarkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200 text-black"}`}
                  disabled={isSimulating}
                />
                <button
                  onClick={() => deletePrompt(prompt.id)}
                  className={`p-2 text-red-500 hover:bg-red-100 rounded-full ${isSimulating ? "opacity-50 cursor-not-allowed" : ""}`}
                  disabled={isSimulating || userPrompts.length <= 1}
                >
                  <FiTrash2 />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addNewPrompt}
            className={`mt-4 flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 ${isSimulating ? "opacity-50 cursor-not-allowed" : ""}`}
            disabled={isSimulating}
          >
            <FiPlus /> Add New Prompt
          </button>
        </div>

        {/* Control Buttons */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={startSimulation}
            disabled={isSimulating || connectionStatus !== "connected"}
            className={`flex-1 py-3 px-6 rounded-lg flex items-center justify-center gap-2 ${
              isSimulating || connectionStatus !== "connected" 
                ? "bg-gray-400 cursor-not-allowed" 
                : "bg-blue-500 hover:bg-blue-600"
            } text-white`}
          >
            <FiPlay /> {isSimulating ? "Simulating..." : "Start Simulation"}
          </button>
          <button
            onClick={resetSimulation}
            className={`flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 ${
              isSimulating ? "opacity-50 cursor-not-allowed" : ""
            }`}
            disabled={isSimulating}
          >
            <FiRefreshCw /> Reset
          </button>
        </div>

        {/* Conversations Display */}
        <div className="space-y-6">
          {conversations.length === 0 && !isSimulating && (
            <div className={`p-6 rounded-lg ${isDarkMode ? "bg-gray-800" : "bg-white"} shadow-lg text-center`}>
              No conversations yet. Configure your prompts and start a simulation.
            </div>
          )}
          
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`p-6 rounded-lg ${isDarkMode ? "bg-gray-800" : "bg-white"} shadow-lg`}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Conversation #{conv.id.substring(0, 8)}...</h3>
                <span className={`px-2 py-1 rounded text-xs ${
                  conv.status === "completed" ? "bg-green-500" : "bg-yellow-500"
                } text-white`}>
                  {conv.status === "completed" ? "Completed" : "In Progress"}
                </span>
              </div>
              
              <div className="space-y-4">
                {conv.messages.length === 0 ? (
                  <div className="text-center text-gray-500">Waiting for messages...</div>
                ) : (
                  conv.messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === "Agent" ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[70%] p-4 rounded-lg ${
                          msg.role === "Agent" 
                            ? (isDarkMode ? "bg-blue-900" : "bg-blue-100") 
                            : (isDarkMode ? "bg-green-900" : "bg-green-100")
                        }`}
                      >
                        <p className="text-sm font-semibold mb-1">{msg.role}</p>
                        <p>{msg.content}</p>
                        <p className="text-xs opacity-70 mt-2">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AIConversationSimulator;