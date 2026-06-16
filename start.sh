#!/bin/bash
cd "$(dirname "$0")"
FLASK_DEBUG=1 python3 app.py
