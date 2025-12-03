# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2025-12-03

### Security
- 🔒 Added comprehensive input validation across all modules
- 🛡️ Protection against injection attacks
- 🔐 Secure token generation for distributed locks
- 🚫 Path traversal prevention in storage operations
- ✅ Environment variable validation (port ranges, etc.)

### Bug Fixes
- 🐛 Fixed memory leak in events subscriber client
- 🐛 Fixed race condition in rate limiting using Lua scripts
- 🐛 Fixed connection management issues
- 🐛 Added chunked deletion to prevent Redis blocking

### Performance
- ⚡ Atomic operations with Lua scripts for rate limiting
- ⚡ Connection pooling optimization
- ⚡ Retry strategy with exponential backoff
- ⚡ Batch operations for large datasets

### Documentation
- 📖 Comprehensive README with examples
- 📚 Complete API documentation
- 🎯 Integration guides for major frameworks
- 🌐 Deployment guides for cloud providers

## [1.0.0] - 2025-12-03

### Added
- 🚀 Initial release
- 📦 Queue management with BullMQ
- ⚡ High-performance caching with Redis
- 📁 S3-compatible object storage with MinIO
- 🔔 Pub/Sub event bus
- 🛡️ Sliding window rate limiting
- 🔒 Distributed locking
- 👤 Session management
