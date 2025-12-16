# Security Configuration

## Environment Variables

This project uses environment variables to manage sensitive configuration. **Never commit actual credentials to the repository.**

### Required Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure the following:

```bash
# qBittorrent Configuration
QBITTORRENT_URL=http://localhost:8080
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=your-actual-password-here

# TMDB API Configuration
# Get your API key from: https://www.themoviedb.org/settings/api
TMDB_API_KEY=your-actual-tmdb-api-key-here
```

### Setting Up Credentials

#### 1. qBittorrent Credentials
1. Install and start qBittorrent-nox
2. Access the web UI at `http://localhost:8080`
3. Login with default credentials (admin/adminadmin)
4. **Immediately change the password** in Settings → Web UI
5. Update your `.env` file with the new password

#### 2. TMDB API Key
1. Create a free account at [The Movie Database](https://www.themoviedb.org/)
2. Go to Settings → API
3. Request an API key (choose "Developer" option)
4. Copy the API key to your `.env` file

### Security Best Practices

1. **Never commit `.env` files** - They are already in `.gitignore`
2. **Use strong passwords** for qBittorrent
3. **Rotate API keys** periodically
4. **Restrict network access** to trusted devices only
5. **Use HTTPS** in production environments
6. **Keep software updated** regularly

### Production Deployment

For production deployments:

1. Set environment variables directly on the server
2. Use a secrets management system if available
3. Ensure `.env` files have restricted permissions (600)
4. Consider using Docker secrets for containerized deployments

### Troubleshooting

#### Missing Environment Variables
If you see errors about missing API keys or credentials:

1. Check that `backend/.env` exists
2. Verify all required variables are set
3. Restart the application after changes
4. Check the application logs for specific error messages

#### Invalid Credentials
- qBittorrent: Verify username/password in the web UI
- TMDB: Test your API key at https://api.themoviedb.org/3/configuration?api_key=YOUR_KEY

## Reporting Security Issues

If you discover a security vulnerability, please email the maintainers directly rather than opening a public issue.