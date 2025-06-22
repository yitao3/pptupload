# PPT Upload System

A Next.js application for uploading PowerPoint presentations to Cloudflare R2 storage with preview image extraction and Supabase database integration.

## Features

- **PPT File Upload**: Upload PowerPoint (.ppt/.pptx) files with drag-and-drop support
- **Preview Image Extraction**: Extract preview images from ZIP files containing presentation screenshots
- **Cloud Storage**: Store files in Cloudflare R2 with organized folder structure
- **Database Integration**: Store metadata in Supabase with categorized organization
- **Progress Tracking**: Real-time upload progress indicators
- **Thumbnail Generation**: Automatic thumbnail creation for preview images
- **Category Classification**: Organize presentations by category and subcategory

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Storage**: Cloudflare R2
- **Database**: Supabase (PostgreSQL)
- **File Processing**: JSZip, Sharp
- **UI Components**: Custom components with progress indicators

## Project Structure

```
uploadppt/
├── app/
│   ├── api/
│   │   ├── batch-upload/
│   │   ├── extract-text/
│   │   ├── process-ppt/
│   │   ├── summarize-text/
│   │   └── upload/
│   ├── batch-upload/
│   ├── extract-text-test/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── convert.py
├── extract_text.py
├── package.json
├── tailwind.config.js
└── README.md
```

## Setup Instructions

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account
- Cloudflare R2 account

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yitao3/pptupload.git
cd pptupload
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env.local` file with the following variables:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Cloudflare R2
R2_ACCOUNT_ID=your_r2_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=your_r2_bucket_name
R2_PUBLIC_URL=your_r2_public_url
```

4. Set up database tables:

Create the following tables in your Supabase database:

**ppt_files table:**
```sql
CREATE TABLE ppt_files (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(255),
  subcategory VARCHAR(255),
  file_type VARCHAR(10),
  file_size INTEGER,
  r2_file_key VARCHAR(500),
  r2_file_url VARCHAR(500),
  slug VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**ppt_previews table:**
```sql
CREATE TABLE ppt_previews (
  id SERIAL PRIMARY KEY,
  ppt_file_id INTEGER REFERENCES ppt_files(id) ON DELETE CASCADE,
  preview_url VARCHAR(500),
  thumbnail_url VARCHAR(500),
  slide_number INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
```

5. Run the development server:
```bash
npm run dev
```

## Usage

1. Open the application in your browser
2. Select a PowerPoint file (.ppt or .pptx)
3. Optionally upload a ZIP file containing preview images
4. Fill in the form with title, description, category, and subcategory
5. Click "Upload" to start the upload process
6. Monitor progress through the progress indicators
7. View success/error messages upon completion

## API Endpoints

- `POST /api/upload` - Upload PPT files and preview images
- `POST /api/process-ppt` - Process uploaded files and store in database
- `POST /api/extract-text` - Extract text from presentations
- `POST /api/summarize-text` - Summarize extracted text
- `POST /api/batch-upload` - Handle batch uploads

## File Organization

Files are organized in Cloudflare R2 with the following structure:
```
ppt-files/
├── [ppt_id]/
│   ├── original/
│   │   └── [filename].pptx
│   └── previews/
│       ├── [slide_number].jpg
│       └── thumbnails/
│           └── [slide_number]_thumb.jpg
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions, please open an issue on GitHub. 