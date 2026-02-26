import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

type ElementTag = keyof JSX.IntrinsicElements;

interface BaseTypographyProps {
  as?: ElementTag;
  className?: string;
  children: React.ReactNode;
}

const renderText = (
  baseClassName: string,
  { as = 'span', className, children }: BaseTypographyProps,
) => {
  const Component = as;
  return <Component className={cn(baseClassName, className)}>{children}</Component>;
};

export const Heading: React.FC<BaseTypographyProps> = (props) =>
  renderText('ui-text-heading', props);

export const LabelText: React.FC<BaseTypographyProps> = (props) =>
  renderText('ui-text-label', props);

export const BodyText: React.FC<BaseTypographyProps> = (props) =>
  renderText('ui-text-body', props);

export const MetricText: React.FC<BaseTypographyProps> = (props) =>
  renderText('ui-text-metric', props);

export const CaptionText: React.FC<BaseTypographyProps> = (props) =>
  renderText('ui-text-caption', props);
