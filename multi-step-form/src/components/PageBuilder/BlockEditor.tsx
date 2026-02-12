import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Button } from '@/components/ui/button';
import { Bold, Italic, List, ListOrdered, Image as ImageIcon, Heading1, Heading2 } from 'lucide-react';
import { supabase } from '@/utils/supabase';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';

interface BlockEditorProps {
    content: any;
    onChange: (content: any) => void;
    editable?: boolean;
}

export function BlockEditor({ content, onChange, editable = true }: BlockEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Image,
            Placeholder.configure({
                placeholder: 'Write something amazing...',
            }),
        ],
        content: content,
        editable: editable,
        onUpdate: ({ editor }) => {
            onChange(editor.getJSON());
        },
        editorProps: {
            attributes: {
                class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[300px] p-4 border rounded-md dark:prose-invert',
            },
        },
    });

    if (!editor) {
        return null;
    }

    const handleImageUpload = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (file) {
                try {
                    // Compress image
                    const options = {
                        maxSizeMB: 0.1, // < 100KB
                        maxWidthOrHeight: 1024,
                        useWebWorker: true,
                    };
                    const compressedFile = await imageCompression(file, options);

                    // Upload to Supabase
                    const fileName = `${Date.now()}-${file.name}`;
                    const { data, error } = await supabase.storage
                        .from('page-uploads')
                        .upload(fileName, compressedFile);

                    if (error) throw error;

                    const { data: { publicUrl } } = supabase.storage
                        .from('page-uploads')
                        .getPublicUrl(fileName);

                    // Insert image into editor
                    editor.chain().focus().setImage({ src: publicUrl }).run();
                    toast.success('Image uploaded successfully');
                } catch (error) {
                    console.error('Error uploading image:', error);
                    toast.error('Failed to upload image');
                }
            }
        };
        input.click();
    };

    return (
        <div className="space-y-2">
            {editable && (
                <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-gray-50 dark:bg-gray-800">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={editor.isActive('bold') ? 'bg-gray-200 dark:bg-gray-700' : ''}
                    >
                        <Bold className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={editor.isActive('italic') ? 'bg-gray-200 dark:bg-gray-700' : ''}
                    >
                        <Italic className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        className={editor.isActive('heading', { level: 1 }) ? 'bg-gray-200 dark:bg-gray-700' : ''}
                    >
                        <Heading1 className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        className={editor.isActive('heading', { level: 2 }) ? 'bg-gray-200 dark:bg-gray-700' : ''}
                    >
                        <Heading2 className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        className={editor.isActive('bulletList') ? 'bg-gray-200 dark:bg-gray-700' : ''}
                    >
                        <List className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        className={editor.isActive('orderedList') ? 'bg-gray-200 dark:bg-gray-700' : ''}
                    >
                        <ListOrdered className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleImageUpload}
                    >
                        <ImageIcon className="w-4 h-4" />
                    </Button>
                </div>
            )}
            <EditorContent editor={editor} />
        </div>
    );
}
