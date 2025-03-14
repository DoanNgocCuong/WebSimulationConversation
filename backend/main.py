import os
import json
import time
import sys
import asyncio
import requests
from typing import Optional, List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from openai import AsyncOpenAI
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Get OpenAI API key from environment variable
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    print("Error: OPENAI_API_KEY environment variable not set")
    sys.exit(1)

# Initialize OpenAI client
client = AsyncOpenAI(api_key=api_key)

# Initialize FastAPI app
app = FastAPI(title="Bot Simulation API")

# Define request model
class SimulationRequest(BaseModel):
    bot_id: int = 16
    user_prompt: str = "sẵn sàng"
    max_turns: int = 3
    history: str = "[]"

# Define response model
class SimulationResponse(BaseModel):
    success: bool
    conversation_history: List[dict]
    simulation_conversation: List[dict] = []
    error: Optional[str] = None

class SimulationTester:
    def __init__(self, bot_id=16):
        self.base_url = "http://103.253.20.13:9404"
        self.init_endpoint = f"{self.base_url}/robot-ai-lesson/api/v1/bot/initConversation"
        self.webhook_endpoint = f"{self.base_url}/robot-ai-lesson/api/v1/bot/webhook"
        self.conversation_id = str(int(time.time() * 1001))
        self.bot_id = bot_id
        self.conversation_history = []
    
    async def init_conversation(self):
        """Initialize conversation with the bot."""
        print(f"\n===== Initializing Conversation =====")
        print(f"Bot ID: {self.bot_id}")
        print(f"Conversation ID: {self.conversation_id}")
        
        payload = {
            "bot_id": self.bot_id,
            "conversation_id": self.conversation_id,
            "input_slots": {}
        }
        
        try:
            start_time = time.time()
            response = requests.post(
                self.init_endpoint,
                headers={'Content-Type': 'application/json'},
                json=payload,
                timeout=10
            )
            elapsed_time = time.time() - start_time
            
            print(f"Response received in {elapsed_time:.2f} seconds")
            print(f"Status code: {response.status_code}")
            
            if response.status_code != 200:
                print(f"Error: HTTP {response.status_code}")
                print(f"Response: {response.text}")
                return False
            
            data = response.json()
            if data.get("status") != 0 or data.get("msg") != "Success":
                print(f"Error: API returned error: {data}")
                return False
            
            print(f"Conversation initialized successfully")
            return True
            
        except Exception as e:
            print(f"Error initializing conversation: {str(e)}")
            return False
    
    async def send_message(self, message):
        """Send a message to the bot."""
        print(f"\n===== Sending Message =====")
        print(f"Message: {message}")
        
        payload = {
            "conversation_id": self.conversation_id,
            "message": message
        }
        
        try:
            start_time = time.time()
            response = requests.post(
                self.webhook_endpoint,
                headers={'Content-Type': 'application/json'},
                json=payload,
                timeout=10
            )
            elapsed_time = time.time() - start_time
            
            print(f"Response received in {elapsed_time:.2f} seconds")
            print(f"Status code: {response.status_code}")
            
            if response.status_code != 200:
                print(f"Error: HTTP {response.status_code}")
                print(f"Response: {response.text}")
                return None
            
            data = response.json()
            status = data.get("status")
            text = data.get("text", [])
            
            print(f"Status: {status}")
            if isinstance(text, list) and len(text) > 0:
                bot_response = text[0]
                print(f"Bot response: {bot_response[:100]}...")
                
                # Add to conversation history only if not duplicate
                if not self.conversation_history or (
                    message != self.conversation_history[-2]["content"] if len(self.conversation_history) >= 2 else True
                ):
                    self.conversation_history.append({"role": "roleA", "content": message})
                    self.conversation_history.append({"role": "roleB", "content": bot_response})
                
                return bot_response
            else:
                print(f"Bot response: {text}")
                return str(text)
            
        except Exception as e:
            print(f"Error sending message: {str(e)}")
            return None
    
    async def generate_user_response(self, bot_message):
        """Generate a user response using OpenAI."""
        print(f"\n===== Generating User Response =====")
        
        # Prepare the prompt for OpenAI
        system_prompt = """
        You are a helpful assistant that generates the next user message in a conversation.
        The user is learning English from a bot. Generate a natural, brief response that continues the conversation.
        Your response should be in Vietnamese and should be a single message without any explanation or additional text.
        """
        
        # Format conversation history for the prompt
        formatted_history = []
        for msg in self.conversation_history:
            role = "user" if msg["role"] == "roleA" else "assistant"
            formatted_history.append({"role": role, "content": msg["content"]})
        
        # Add system message at the beginning
        messages = [{"role": "system", "content": system_prompt}] + formatted_history
        
        try:
            start_time = time.time()
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                max_tokens=100,
                temperature=0.7
            )
            elapsed_time = time.time() - start_time
            
            user_message = response.choices[0].message.content.strip()
            print(f"Generated in {elapsed_time:.2f} seconds: {user_message}")
            return user_message
        except Exception as e:
            print(f"Error generating user response: {str(e)}")
            return "Tôi không hiểu. Bạn có thể giải thích rõ hơn không?"
    
    async def run_simulation(self, initial_message="sẵn sàng", turns=3):
        """Run a full simulation."""
        print(f"\n===== Starting Simulation =====")
        print(f"Initial message: {initial_message}")
        print(f"Number of turns: {turns}")
        
        # Initialize conversation
        if not await self.init_conversation():
            print("Failed to initialize conversation")
            return False
        
        # Send initial message
        bot_response = await self.send_message(initial_message)
        if not bot_response:
            print("Failed to get initial bot response")
            return False
        
        # Run conversation turns
        for i in range(1, turns):
            print(f"\n----- Turn {i}/{turns-1} -----")
            
            # Generate user response
            user_message = await self.generate_user_response(bot_response)
            
            # Send user message to bot
            bot_response = await self.send_message(user_message)
            if not bot_response:
                print(f"Failed to get bot response in turn {i}")
                return False
        
        print("\n===== Simulation Completed =====")
        print(f"Total messages: {len(self.conversation_history)}")
        
        # Print conversation summary
        print("\n===== Conversation Summary =====")
        for i, msg in enumerate(self.conversation_history):
            role_name = "User" if msg["role"] == "roleA" else "Bot"
            content = msg["content"]
            if len(content) > 100:
                content = content[:100] + "..."
            print(f"{i+1}. {role_name}: {content}")
        
        return True

async def main():
    """Main function to run the test."""
    # Parse command line arguments
    initial_message = "sẵn sàng"
    turns = 3
    
    if len(sys.argv) > 1:
        initial_message = sys.argv[1]
    if len(sys.argv) > 2:
        try:
            turns = int(sys.argv[2])
        except ValueError:
            print("Error: Number of turns must be an integer")
            return
    
    # Run the simulation
    tester = SimulationTester()
    success = await tester.run_simulation(initial_message, turns)
    
    if success:
        print("\nSimulation completed successfully!")
    else:
        print("\nSimulation failed!")

# Add this health check endpoint
@app.get("/healthy")
async def health_check():
    return {"status": "ok"}

@app.post("/simulate", response_model=SimulationResponse)
async def simulate(request: SimulationRequest):
    """API endpoint to run a simulation"""
    try:
        # Extract parameters from request
        bot_id = request.bot_id
        user_prompt = request.user_prompt
        max_turns = request.max_turns
        history_json = request.history
        
        # Parse history from JSON string
        try:
            history = json.loads(history_json)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid history JSON: {str(e)}")
        
        # Initialize tester with specified bot_id
        tester = SimulationTester(bot_id)
        
        # Convert history format if needed
        conversation_history = []
        for msg in history:
            role = "roleA" if msg["role"] == "user" else "roleB"
            conversation_history.append({"role": role, "content": msg["content"]})
        
        # Set conversation history
        tester.conversation_history = conversation_history
        
        # Run simulation
        success = await tester.run_simulation(user_prompt, max_turns)
        
        # Keep original roles in the API response
        formatted_history = []
        for msg in tester.conversation_history:
            formatted_history.append({"role": msg["role"], "content": msg["content"]})
        
        # Format the simulation conversation
        simulation_conversation = []
        for i, msg in enumerate(tester.conversation_history):
            role_name = "User" if msg["role"] == "roleA" else "Bot"
            simulation_conversation.append({
                "role": role_name,
                "content": msg["content"]
            })
        
        return SimulationResponse(
            success=success,
            conversation_history=formatted_history,
            simulation_conversation=simulation_conversation
        )
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error in simulation: {error_details}")
        
        # Still return any available conversation history
        formatted_history = []
        simulation_conversation = []
        
        if 'tester' in locals() and hasattr(tester, 'conversation_history'):
            for msg in tester.conversation_history:
                formatted_history.append({"role": msg["role"], "content": msg["content"]})
                
                role_name = "User" if msg["role"] == "roleA" else "Bot"
                simulation_conversation.append({
                    "role": role_name,
                    "content": msg["content"]
                })
        
        return SimulationResponse(
            success=False,
            conversation_history=formatted_history,
            simulation_conversation=simulation_conversation,
            error=str(e)
        )

# Thêm route để xử lý yêu cầu WebSocket
@app.get("/ws/{client_id}")
async def websocket_endpoint(client_id: str):
    """Handle WebSocket connection requests with a proper HTTP response."""
    return {
        "status": "error",
        "message": "WebSocket connections are not supported by this server. Please use HTTP endpoints instead.",
        "client_id": client_id
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
