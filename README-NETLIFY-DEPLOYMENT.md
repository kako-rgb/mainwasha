# Deploying to Netlify

This guide explains how to deploy your Loan Management System to Netlify, with both frontend and backend hosted on Netlify.

## Prerequisites

1. A Netlify account
2. Your code pushed to a Git repository (GitHub, GitLab, or Bitbucket)

## Deployment Steps

### 1. Connect your repository to Netlify

1. Log in to your Netlify account
2. Click "New site from Git"
3. Choose your Git provider (GitHub, GitLab, or Bitbucket)
4. Select your repository
5. Configure the build settings:
   - Build command: Leave blank (or use `npm install` if you want to install dependencies)
   - Publish directory: `.` (the root directory)

### 2. Configure environment variables

1. Go to Site settings > Environment variables
2. Add the following environment variables:
   - `MONGODB_URI`: Your MongoDB connection string
   - `JWT_SECRET`: A secret key for JWT token generation

### 3. Deploy Netlify Functions

Netlify will automatically detect and deploy the functions in the `netlify/functions` directory.

### 4. Test your deployment

Once deployed, your site will be available at a Netlify subdomain (e.g., `https://your-site-name.netlify.app`).

- Frontend: `https://your-site-name.netlify.app`
- API: `https://your-site-name.netlify.app/api`
- Auth endpoints:
  - Login: `https://your-site-name.netlify.app/api/auth/login`
  - Logout: `https://your-site-name.netlify.app/api/auth/logout`
  - Current user: `https://your-site-name.netlify.app/api/auth/me`

## Troubleshooting

### CORS issues

If you encounter CORS issues, check the CORS headers in your Netlify Functions and make sure they allow requests from your frontend domain.

### Function timeout

Netlify Functions have a timeout limit of 10 seconds. If your functions are timing out, optimize your code or consider using a different backend service.

### MongoDB connection issues

Make sure your MongoDB Atlas cluster is configured to accept connections from Netlify's IP addresses. You may need to set the network access to allow connections from anywhere (0.0.0.0/0).

## Additional Resources

- [Netlify Functions documentation](https://docs.netlify.com/functions/overview/)
- [Netlify CLI](https://docs.netlify.com/cli/get-started/) for local development
- [Netlify Dev](https://www.netlify.com/products/dev/) for testing functions locally