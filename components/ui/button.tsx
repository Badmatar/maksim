// shadcn/ui Button pattern, adapted to the project's visual tokens.
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva,type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const buttonVariants=cva('button',{variants:{variant:{default:'primary',outline:'',destructive:'danger'},size:{default:'',sm:'small'}},defaultVariants:{variant:'default',size:'default'}});
export function Button({className,variant,size,asChild=false,...props}:React.ComponentProps<'button'>&VariantProps<typeof buttonVariants>&{asChild?:boolean}){const Comp=asChild?Slot:'button';return <Comp data-slot="button" className={cn(buttonVariants({variant,size,className}))} {...props}/>;}
