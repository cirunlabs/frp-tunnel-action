#!/bin/bash

# Function to retry curl until it gets a non-empty response
test_frp_client_accessible_from_frp_server() {
  local url=$1
  local max_retries=${2:-10}
  local retry_interval=${3:-2}

  for ((i = 1; i <= max_retries; i++)); do
    echo "Attempt $i: curl -s -k $url"
    RESPONSE=$(curl -s -k "$url")

    if [[ -n "$RESPONSE" ]]; then
      echo "Response received: $RESPONSE"
      return 0 # Success
    fi

    echo "Attempt $i failed. Retrying in $retry_interval seconds..."
    sleep "$retry_interval"
  done

  echo "Test failed! No response after $max_retries attempts."
  return 1 # Failure
}

# Function to start a local HTTP server and test response
start_local_server() {
  # Create index.html with Hello World
  touch index.html
  echo "Hello World" >index.html
  # Start Python HTTP server in the background
  python -m http.server 5000 &
  # Give the server some time to start
  sleep 2
  # Test if the server is responding
  local url="http://127.0.0.1:5000"
  RESPONSE=$(curl -s -k "$url")
  echo "Response: $RESPONSE"
}

# Start local server where frp client will route traffic
start_local_server

# Test frp connection
test_frp_client_accessible_from_frp_server "http://$FRP_SERVER:$FRP_REMOTE_PORT"
