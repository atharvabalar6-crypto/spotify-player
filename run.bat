@echo off
title Spotify Self-Hosted Streaming Server
echo ===================================================
echo   Starting Spotify Streaming Server on http://localhost:8080
echo ===================================================
start "" http://localhost:8080
python app.py
pause

