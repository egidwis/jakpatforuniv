import { useEditor, EditorContent } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { Button } from '@/components/ui/button';
import { Bold, Italic, List, ListOrdered, Image as ImageIcon, Heading1, Heading2, Link as LinkIcon } from 'lucide-react';
import { supabase } from '@/utils/supabase';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';

interface BlockEditorProps {
    content: any;
    onChange: (content: any) => void;
    editable?: boolean;
}

export function BlockEditor({ content, onChange, editable = true }: BlockEditorProps) {
    const isInternalUpdate = useRef(false);

    const editor = useEditor({
        extensions: [
            StarterKit,
            Image.configure({
                inline: true,
                allowBase64: true,
            }),
            Link.configure({
                openOnClick: false,
                autolink: true,
                linkOnPaste: true,
                HTMLAttributes: {
                    class: 'text-blue-600 hover:text-blue-800 underline cursor-pointer',
                },
            }),
            Placeholder.configure({
                placeholder: 'Write something amazing...',
            }),
        ],
        content: content,
        editable: editable,
        onUpdate: ({ editor }) => {
            isInternalUpdate.current = true;
            onChange(editor.getJSON());
        },
        editorProps: {
            attributes: {
                class: 'prose prose-slate max-w-none focus:outline-none min-h-[320px] p-4 border border-slate-200 rounded-xl bg-white focus:border-blue-500 transition-all shadow-2xs dark:prose-invert [&_.ProseMirror-selectednode]:ring-2 [&_.ProseMirror-selectednode]:ring-blue-500 [&_.ProseMirror-selectednode]:ring-offset-2 [&_.ProseMirror-selectednode]:rounded-md',
            },
        },
    });

    // Sync content from parent when it changes externally (e.g. initialData loaded async)
    useEffect(() => {
        if (!editor) return;
        if (isInternalUpdate.current) {
            isInternalUpdate.current = false;
            return;
        }
        // Only update if content actually has meaningful data
        const hasContent = content && typeof content === 'object' && (content.type || (content.content && content.content.length > 0));
        if (hasContent) {
            const currentJSON = JSON.stringify(editor.getJSON());
            const newJSON = JSON.stringify(content);
            if (currentJSON !== newJSON) {
                editor.commands.setContent(content, { emitUpdate: false });
            }
        }
    }, [content, editor]);

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
                    const { error } = await supabase.storage
                        .from('page-uploads')
                        .upload(fileName, compressedFile);

                    if (error) throw error;

                    const { data: { publicUrl } } = supabase.storage
                        .from('page-uploads')
                        .getPublicUrl(fileName);

                    // Insert image into editor
                    editor.chain().focus().setImage({ src: publicUrl }).run();
                    toast.success('Gambar berhasil diunggah');
                } catch (error: any) {
                    console.error('Error uploading image:', error);
                    toast.error(error.message || 'Gagal mengunggah gambar');
                }
            }
        };
        input.click();
    };

    const setLink = () => {
        const previousUrl = editor.getAttributes('link').href;

        // Use prompt for a simple intuitive UI
        const url = window.prompt('URL', previousUrl);

        // cancelled
        if (url === null) {
            return;
        }

        // empty
        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }

        // update link
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    };

    return (
        <div className="space-y-2.5">
            {editable && (
                <div className="flex flex-wrap items-center gap-1 p-1.5 border border-slate-200 rounded-xl bg-slate-50/80">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={`h-8 w-8 p-0 text-slate-600 hover:text-slate-900 rounded-lg transition-colors ${editor.isActive('bold') ? 'bg-white shadow-2xs font-bold text-blue-600' : 'hover:bg-white/80'}`}
                        title="Bold"
                    >
                        <Bold className="w-4 h-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={`h-8 w-8 p-0 text-slate-600 hover:text-slate-900 rounded-lg transition-colors ${editor.isActive('italic') ? 'bg-white shadow-2xs text-blue-600' : 'hover:bg-white/80'}`}
                        title="Italic"
                    >
                        <Italic className="w-4 h-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        className={`h-8 w-8 p-0 text-slate-600 hover:text-slate-900 rounded-lg transition-colors ${editor.isActive('heading', { level: 1 }) ? 'bg-white shadow-2xs font-bold text-blue-600' : 'hover:bg-white/80'}`}
                        title="Heading 1"
                    >
                        <Heading1 className="w-4 h-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        className={`h-8 w-8 p-0 text-slate-600 hover:text-slate-900 rounded-lg transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-white shadow-2xs font-bold text-blue-600' : 'hover:bg-white/80'}`}
                        title="Heading 2"
                    >
                        <Heading2 className="w-4 h-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        className={`h-8 w-8 p-0 text-slate-600 hover:text-slate-900 rounded-lg transition-colors ${editor.isActive('bulletList') ? 'bg-white shadow-2xs text-blue-600' : 'hover:bg-white/80'}`}
                        title="Bullet List"
                    >
                        <List className="w-4 h-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        className={`h-8 w-8 p-0 text-slate-600 hover:text-slate-900 rounded-lg transition-colors ${editor.isActive('orderedList') ? 'bg-white shadow-2xs text-blue-600' : 'hover:bg-white/80'}`}
                        title="Numbered List"
                    >
                        <ListOrdered className="w-4 h-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleImageUpload}
                        className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 hover:bg-white/80 rounded-lg transition-colors"
                        title="Upload Image"
                    >
                        <ImageIcon className="w-4 h-4" />
                    </Button>
                    <div className="w-px h-5 bg-slate-200 mx-1 self-center" />
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={setLink}
                        className={`h-8 w-8 p-0 text-slate-600 hover:text-slate-900 rounded-lg transition-colors ${editor.isActive('link') ? 'bg-white shadow-2xs text-blue-600' : 'hover:bg-white/80'}`}
                        title="Add Link"
                    >
                        <LinkIcon className="w-4 h-4" />
                    </Button>
                </div>
            )}
            <EditorContent editor={editor} />
        </div>
    );
}
