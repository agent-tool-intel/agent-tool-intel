# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Agent Tool Intelligence, please report it responsibly.

**Do not open a public issue.**

Instead, email us at **hmcheng@bingohkmail.com** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (if available)

We will respond within 48 hours and work with you on a fix and disclosure timeline.

## Supported Versions

| Version | Supported |
|---------|:---------:|
| 0.2.x (latest) | ✅ |
| 0.1.x | ❌ |

## Security Practices

- All dependencies are audited with `npm audit` on every build
- API endpoints are rate-limited
- Database access is restricted via Supabase Row Level Security
- No secrets are stored in code or committed to git
- Sensitive environment variables are managed through Railway

## Past Vulnerabilities

None reported. Be the first to help us improve.

## Recognition

We will acknowledge responsible disclosures on this page (unless you prefer to remain anonymous).
