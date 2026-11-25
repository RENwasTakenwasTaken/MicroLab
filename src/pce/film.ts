// Film mode (development only): open a PCE experiment as /?film#/pce/exp/<id> and the bench is shown
// on a black stage, without the room, the overlays or the top bar, with shadows and anti-aliasing
// forced on: for capturing stills for the promotional video. Students never see it.

export const FILM = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('film');
