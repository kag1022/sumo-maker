import React from 'react';
import { cn } from '../lib/cn';
import styles from '../styles/typography.module.css';

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
  renderText(styles.heading, props);

export const LabelText: React.FC<BaseTypographyProps> = (props) =>
  renderText(styles.label, props);

export const BodyText: React.FC<BaseTypographyProps> = (props) =>
  renderText(styles.body, props);

export const MetricText: React.FC<BaseTypographyProps> = (props) =>
  renderText(styles.metric, props);

export const CaptionText: React.FC<BaseTypographyProps> = (props) =>
  renderText(styles.caption, props);
