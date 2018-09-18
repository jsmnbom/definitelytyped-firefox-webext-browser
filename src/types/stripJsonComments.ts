interface StripJsonOptions {
    whitespace?: boolean;
}

declare function stripJsonComments(input: string, opts?: StripJsonOptions): string;
export default stripJsonComments;
