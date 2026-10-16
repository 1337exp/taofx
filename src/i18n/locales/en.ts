import type ru from './ru';

const en: typeof ru = {
    ui: {
        language: 'Language',
    },
    file: {
        new: 'New',
        open: 'Open',
        save: 'Save',
        newGraph: 'New graph',
        loaded: 'Opened: {0} node(s)',
        loadedWithDropped: 'Opened: {0} node(s), {1} invalid link(s) dropped',
        error: {
            invalidJson: 'The file is not valid JSON',
            notTaofxFile: 'This is not a taofx file',
            newerVersion: 'The file was made by a newer version ({0})',
            invalidStructure: 'The file is damaged: {0}',
            unknownNode: 'Unknown node in the file: {0}',
            tooLarge: 'The file is too large',
            saveFailed: 'Could not save in the browser: out of space or storage is disabled',
            restoreFailed: 'The saved graph could not be read: a copy was set aside, the demo graph is open',
        },
    },
    history: {
        undo: 'Undo',
        redo: 'Redo',
    },
    view: {
        fit: 'Fit view',
    },
    palette: {
        add: 'Add node',
        compatible: 'Node for the link',
        search: 'Search…',
        empty: 'Nothing found',
    },
    preview: {
        sphere: 'Sphere',
        plane: 'Plane',
        ok: 'Graph compiled',
        errors: 'Errors: {0}',
    },
    nodeTexts: {
        nodes: {},
        categories: {},
    },
};

export default en;
